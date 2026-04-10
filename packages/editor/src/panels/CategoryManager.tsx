import { useState, type CSSProperties } from "react";
import type { Venue, PricingCategory, CommandHistory } from "@nex125/seatmap-core";
import { generateId, isStageSection } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";

export interface CategoryManagerProps {
  venue: Venue | null;
  history: CommandHistory;
  store: SeatmapStore;
  fetchCategoryPrices?: (categoryIds: string[]) => Promise<Record<string, number>>;
  style?: CSSProperties;
  locale?: string;
  currency?: string;
}

const btnSmall: CSSProperties = {
  padding: "3px 8px",
  border: "1px solid #3a3836",
  borderRadius: 4,
  background: "#242424",
  color: "#e5e2e1",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui",
};

const colorPickerShellStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 5,
  border: "1px solid #5c5957",
  overflow: "hidden",
  flexShrink: 0,
  background: "#242424",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(229, 226, 225, 0.16)",
  position: "relative",
};

const colorPickerInputStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  padding: 0,
  margin: 0,
  display: "inline-block",
  background: "transparent",
  opacity: 0,
};

function replaceCategoryInVenue(venue: Venue, categoryId: string, replacementCategoryId: string): Venue {
  return {
    ...venue,
    sections: venue.sections.map((section) => ({
      ...section,
      categoryId: isStageSection(section)
        ? ""
        : section.categoryId === categoryId
          ? replacementCategoryId
          : section.categoryId,
      rows: section.rows.map((row) => ({
        ...row,
        seats: row.seats.map((seat) =>
          seat.categoryId === categoryId ? { ...seat, categoryId: replacementCategoryId } : seat,
        ),
      })),
    })),
    gaAreas: venue.gaAreas.map((gaArea) =>
      gaArea.categoryId === categoryId ? { ...gaArea, categoryId: replacementCategoryId } : gaArea,
    ),
    tables: venue.tables.map((table) => ({
      ...table,
      categoryId: table.categoryId === categoryId ? replacementCategoryId : table.categoryId,
      seats: table.seats.map((seat) =>
        seat.categoryId === categoryId ? { ...seat, categoryId: replacementCategoryId } : seat,
      ),
    })),
  };
}

export function CategoryManager({
  venue,
  history,
  store,
  fetchCategoryPrices,
  style,
  locale = "ru-RU",
  currency = "BYN",
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4caf50");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#4caf50");
  const [isPriceManagerOpen, setIsPriceManagerOpen] = useState(false);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"not-synced" | "syncing" | "synced" | "failed">("not-synced");
  const [overridePriceDrafts, setOverridePriceDrafts] = useState<Record<string, string>>({});

  if (!venue) return null;

  const formatPrice = (price?: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(Number.isFinite(price) ? (price as number) : 0);

  const effectivePrice = (category: PricingCategory) => {
    if (category.isPriceOverridden && Number.isFinite(category.overriddenPrice)) {
      return category.overriddenPrice;
    }
    return Number.isFinite(category.backendPrice) ? category.backendPrice : 0;
  };

  const openPriceManager = () => {
    const initialDrafts: Record<string, string> = {};
    for (const category of venue.categories) {
      const value = category.overriddenPrice;
      initialDrafts[category.id] = Number.isFinite(value) ? String(value) : "";
    }
    setOverridePriceDrafts(initialDrafts);
    setFetchError(null);
    setSyncStatus("not-synced");
    setIsPriceManagerOpen(true);
  };

  const addCategory = () => {
    if (!newName.trim()) return;
    const cat: PricingCategory = {
      id: generateId(),
      name: newName.trim(),
      color: newColor,
    };

    history.execute({
      description: `Add category "${cat.name}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: [...cur.categories, cat] });
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: cur.categories.filter((c) => c.id !== cat.id) });
      },
    });

    setNewName("");
  };

  const startEdit = (category: PricingCategory) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingColor(category.color);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmedName = editingName.trim();
    if (!trimmedName) return;

    history.execute({
      description: `Update category "${trimmedName}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({
          ...cur,
          categories: cur.categories.map((category) =>
            category.id === editingId
              ? { ...category, name: trimmedName, color: editingColor }
              : category,
          ),
        });
      },
      undo: () => {
        const original = venue.categories.find((category) => category.id === editingId);
        const cur = store.getState().venue;
        if (!cur || !original) return;
        store.getState().setVenue({
          ...cur,
          categories: cur.categories.map((category) =>
            category.id === editingId ? original : category,
          ),
        });
      },
    });

    setEditingId(null);
  };

  const removeCategory = (catId: string) => {
    const current = store.getState().venue;
    if (!current || current.categories.length <= 1) return;
    const cat = current.categories.find((c) => c.id === catId);
    if (!cat) return;
    const replacementCategory = current.categories.find((c) => c.id !== catId);
    if (!replacementCategory) return;

    const previousVenue = current;
    const nextVenue = replaceCategoryInVenue(
      {
        ...previousVenue,
        categories: previousVenue.categories.filter((c) => c.id !== catId),
      },
      catId,
      replacementCategory.id,
    );

    history.execute({
      description: `Remove category "${cat.name}"`,
      execute: () => {
        store.getState().setVenue(nextVenue);
      },
      undo: () => {
        store.getState().setVenue(previousVenue);
      },
    });
  };

  const syncPricesFromBackend = async () => {
    if (!fetchCategoryPrices) return;
    setFetchError(null);
    setIsFetchingPrices(true);
    setSyncStatus("syncing");
    try {
      const currentVenue = store.getState().venue;
      if (!currentVenue) return;
      const categoryIds = currentVenue.categories.map((category) => category.id);
      const backendPrices = await fetchCategoryPrices(categoryIds);
      const previousVenue = currentVenue;
      const nextVenue: Venue = {
        ...currentVenue,
        categories: currentVenue.categories.map((category) => {
          const nextPrice = backendPrices[category.id];
          return { ...category, backendPrice: Number.isFinite(nextPrice) ? nextPrice : 0 };
        }),
      };
      history.execute({
        description: "Sync prices from backend",
        execute: () => {
          const cur = store.getState().venue;
          if (!cur) return;
          store.getState().setVenue(nextVenue);
        },
        undo: () => {
          const cur = store.getState().venue;
          if (!cur) return;
          store.getState().setVenue(previousVenue);
        },
      });
      setSyncStatus("synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить цены.";
      setFetchError(message);
      const currentVenue = store.getState().venue;
      if (currentVenue) {
        store.getState().setVenue({
          ...currentVenue,
          categories: currentVenue.categories.map((category) => ({
            ...category,
            backendPrice: 0,
          })),
        });
      }
      setSyncStatus("failed");
    } finally {
      setIsFetchingPrices(false);
    }
  };

  const toggleOverride = (categoryId: string, enabled: boolean) => {
    const currentVenue = store.getState().venue;
    if (!currentVenue) return;
    const previousVenue = currentVenue;
    const nextVenue: Venue = {
      ...currentVenue,
      categories: currentVenue.categories.map((category) => {
        if (category.id !== categoryId) return category;
        if (!enabled) return { ...category, isPriceOverridden: false };
        const resolvedOverride =
          Number.isFinite(category.overriddenPrice)
            ? category.overriddenPrice
            : Number.isFinite(category.backendPrice)
              ? category.backendPrice
              : 0;
        return {
          ...category,
          isPriceOverridden: true,
          overriddenPrice: Number.isFinite(resolvedOverride) ? resolvedOverride : category.overriddenPrice,
        };
      }),
    };
    history.execute({
      description: `${enabled ? "Enable" : "Disable"} price override`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue(nextVenue);
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue(previousVenue);
      },
    });
  };

  const commitOverridePrice = (categoryId: string) => {
    const raw = overridePriceDrafts[categoryId] ?? "";
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const currentVenue = store.getState().venue;
    if (!currentVenue) return;
    const previousVenue = currentVenue;
    const nextVenue: Venue = {
      ...currentVenue,
      categories: currentVenue.categories.map((category) =>
        category.id === categoryId
          ? { ...category, isPriceOverridden: true, overriddenPrice: parsed }
          : category,
      ),
    };
    history.execute({
      description: "Update category override price",
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue(nextVenue);
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue(previousVenue);
      },
    });
  };

  const resetOverrideDraft = (category: PricingCategory) => {
    const value = Number.isFinite(category.overriddenPrice) ? category.overriddenPrice : undefined;
    setOverridePriceDrafts((current) => ({
      ...current,
      [category.id]: Number.isFinite(value) ? String(value) : "",
    }));
  };

  const isDraftChanged = (category: PricingCategory) => {
    const draft = overridePriceDrafts[category.id] ?? "";
    const persisted = Number.isFinite(category.overriddenPrice) ? String(category.overriddenPrice) : "";
    return draft !== persisted;
  };

  const adjustOverrideDraft = (categoryId: string, delta: number) => {
    setOverridePriceDrafts((current) => {
      const raw = current[categoryId] ?? "";
      const parsed = Number.parseFloat(raw);
      const baseValue = Number.isFinite(parsed) ? parsed : 0;
      const nextValue = Math.max(0, baseValue + delta);
      return {
        ...current,
        [categoryId]: nextValue.toFixed(2),
      };
    });
  };

  const switchTrackBase: CSSProperties = {
    width: 34,
    height: 20,
    borderRadius: 999,
    border: "1px solid #4c4845",
    padding: 2,
    display: "inline-flex",
    alignItems: "center",
    transition: "all 0.12s ease",
  };

  const switchThumbBase: CSSProperties = {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#e5e2e1",
    transition: "transform 0.12s ease",
  };

  return (
    <div style={{ padding: 16, ...style }}>
      <div style={{ fontWeight: 600, color: "#e5e2e1", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }}>
        Ценовые категории
      </div>

      {venue.categories.map((cat: PricingCategory) => {
        const isEditing = editingId === cat.id;
        return (
          <div
            key={cat.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 6,
              padding: "4px 8px",
              borderRadius: 4,
              background: "#232323",
            }}
          >
            <span style={colorPickerShellStyle}>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: isEditing ? editingColor : cat.color,
                }}
              />
              <input
                type="color"
                value={isEditing ? editingColor : cat.color}
                onChange={(e) => isEditing && setEditingColor(e.target.value)}
                disabled={!isEditing}
                style={{
                  ...colorPickerInputStyle,
                  cursor: isEditing ? "pointer" : "default",
                }}
                title={isEditing ? "Выбрать цвет категории" : "Включите редактирование для смены цвета"}
              />
            </span>
            {isEditing ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "2px 6px",
                  background: "#1d1d1d",
                  border: "1px solid #3a3836",
                  borderRadius: 4,
                  color: "#e5e2e1",
                  fontSize: 12,
                  fontFamily: "system-ui",
                }}
              />
            ) : (
              <div style={{ flex: 1, color: "#e5e2e1", fontSize: 13, fontFamily: "system-ui" }}>
                {cat.name}
              </div>
            )}
            {isEditing ? (
              <>
                <button onClick={saveEdit} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Сохранить
                </button>
                <button onClick={() => setEditingId(null)} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Отмена
                </button>
              </>
            ) : (
              <>
                <span
                  style={{
                    color: "#9a9694",
                    fontSize: 12,
                    fontFamily: "system-ui",
                    marginRight: 2,
                  }}
                >
                  {formatPrice(effectivePrice(cat))}
                </span>
                <button onClick={() => startEdit(cat)} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Изм.
                </button>
                <button
                  onClick={() => removeCategory(cat.id)}
                  style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}
                  disabled={venue.categories.length <= 1}
                  title={venue.categories.length <= 1 ? "Нужна минимум одна категория" : "Удалить категорию"}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
        <span style={{ ...colorPickerShellStyle, width: 16, height: 16, borderRadius: 5 }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: newColor }} />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ ...colorPickerInputStyle, cursor: "pointer" }}
            title="Выбрать цвет новой категории"
          />
        </span>
        <input
          placeholder="Название категории"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          style={{
            flex: 1,
            padding: "4px 8px",
            background: "#242424",
            border: "1px solid #3a3836",
            borderRadius: 4,
            color: "#e5e2e1",
            fontSize: 13,
            fontFamily: "system-ui",
          }}
        />
        <button onClick={addCategory} style={btnSmall}>
          Добавить
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button onClick={openPriceManager} style={btnSmall}>
          Управление ценами
        </button>
      </div>

      {isPriceManagerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 10, 10, 0.7)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setIsPriceManagerOpen(false)}
        >
          <div
            style={{
              width: "min(860px, 95vw)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "#181818",
              border: "1px solid #322f2c",
              borderRadius: 10,
              padding: 16,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#e5e2e1", fontSize: 15, fontFamily: "system-ui", fontWeight: 600 }}>
                Цены категорий
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={syncPricesFromBackend}
                  disabled={!fetchCategoryPrices || isFetchingPrices}
                  style={{
                    ...btnSmall,
                    opacity: !fetchCategoryPrices || isFetchingPrices ? 0.6 : 1,
                    cursor: !fetchCategoryPrices || isFetchingPrices ? "not-allowed" : "pointer",
                  }}
                  title={fetchCategoryPrices ? "Загрузить актуальные цены из backend" : "Загрузка цен из backend не настроена"}
                >
                  {isFetchingPrices ? "Синхронизация..." : "Синхронизировать с backend"}
                </button>
                <button onClick={() => setIsPriceManagerOpen(false)} style={btnSmall}>
                  Закрыть
                </button>
              </div>
            </div>

              <div style={{ color: "#9a9694", fontSize: 12, fontFamily: "system-ui", marginBottom: 10 }}>
              Цены backend доступны только для чтения. Override позволяет временно использовать переопределенную цену категории в этой схеме.
            </div>
            <div
              style={{
                marginBottom: 10,
                color:
                  syncStatus === "synced"
                    ? "#8fd3a6"
                    : syncStatus === "failed"
                      ? "#ff9a9a"
                      : "#b3aeac",
                fontSize: 12,
                fontFamily: "system-ui",
              }}
            >
              Статус синхронизации:{" "}
              {syncStatus === "not-synced"
                ? "Не синхронизировано"
                : syncStatus === "syncing"
                  ? "Синхронизация..."
                  : syncStatus === "synced"
                    ? "Синхронизировано"
                    : "Ошибка"}
            </div>
            {fetchError && (
              <div style={{ marginBottom: 10, color: "#ff9a9a", fontSize: 12, fontFamily: "system-ui" }}>
                {fetchError}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(160px, 1.6fr) minmax(92px, 0.9fr) minmax(88px, 0.8fr) minmax(188px, 1.4fr) minmax(96px, 0.9fr)",
                gap: 8,
              }}
            >
              <div style={{ color: "#9a9694", fontSize: 11, fontFamily: "system-ui" }}>Категория</div>
              <div style={{ color: "#9a9694", fontSize: 11, fontFamily: "system-ui" }}>Backend</div>
              <div style={{ color: "#9a9694", fontSize: 11, fontFamily: "system-ui" }}>Override</div>
              <div style={{ color: "#9a9694", fontSize: 11, fontFamily: "system-ui" }}>Цена override</div>
              <div style={{ color: "#9a9694", fontSize: 11, fontFamily: "system-ui" }}>Итоговая цена</div>

              {venue.categories.map((category) => (
                <div
                  key={category.id}
                  style={{
                    gridColumn: "1 / -1",
                    display: "grid",
                    gridTemplateColumns: "minmax(160px, 1.6fr) minmax(92px, 0.9fr) minmax(88px, 0.8fr) minmax(188px, 1.4fr) minmax(96px, 0.9fr)",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#232323",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: category.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "#e5e2e1", fontSize: 13, fontFamily: "system-ui" }}>{category.name}</span>
                  </div>
                  <span style={{ color: "#d2cdcb", fontSize: 12, fontFamily: "system-ui" }}>
                    {formatPrice(category.backendPrice)}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(category.isPriceOverridden)}
                    onClick={() => toggleOverride(category.id, !category.isPriceOverridden)}
                    style={{
                      ...switchTrackBase,
                      background: category.isPriceOverridden ? "#5f5632" : "#242424",
                      borderColor: category.isPriceOverridden ? "#8b7f46" : "#4c4845",
                      cursor: "pointer",
                    }}
                    title={category.isPriceOverridden ? "Выключить override" : "Включить override"}
                  >
                    <span
                      style={{
                        ...switchThumbBase,
                        transform: category.isPriceOverridden ? "translateX(14px)" : "translateX(0)",
                      }}
                    />
                  </button>
                  <div style={{ position: "relative", width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={overridePriceDrafts[category.id] ?? ""}
                      disabled={!category.isPriceOverridden}
                      onChange={(event) =>
                        setOverridePriceDrafts((current) => ({ ...current, [category.id]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitOverridePrice(category.id);
                        }
                        if (event.key === "Escape") {
                          resetOverrideDraft(category);
                        }
                      }}
                      style={{
                        padding: "4px 92px 4px 8px",
                        background: category.isPriceOverridden ? "#242424" : "#24242488",
                        border: "1px solid #3a3836",
                        borderRadius: 4,
                        color: category.isPriceOverridden ? "#e5e2e1" : "#9a9694",
                        fontSize: 12,
                        fontFamily: "system-ui",
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        MozAppearance: "textfield",
                      }}
                    />
                    {category.isPriceOverridden && (
                      <div
                        style={{
                          position: "absolute",
                          right: 3,
                          top: "50%",
                          transform: "translateY(-50%)",
                          display: "inline-flex",
                          gap: 2,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => adjustOverrideDraft(category.id, 0.01)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            border: "1px solid #4c4845",
                            background: "#242424",
                            color: "#d2cdcb",
                            fontSize: 12,
                            lineHeight: 1,
                            padding: 0,
                            cursor: "pointer",
                          }}
                          title="Увеличить цену override"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustOverrideDraft(category.id, -0.01)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            border: "1px solid #4c4845",
                            background: "#242424",
                            color: "#d2cdcb",
                            fontSize: 12,
                            lineHeight: 1,
                            padding: 0,
                            cursor: "pointer",
                          }}
                          title="Уменьшить цену override"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => commitOverridePrice(category.id)}
                          disabled={!isDraftChanged(category)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            border: "1px solid #8b7f46",
                            background: isDraftChanged(category) ? "#5f5632" : "#4f4933",
                            color: "#f1e8bf",
                            fontSize: 11,
                            lineHeight: 1,
                            padding: 0,
                            opacity: isDraftChanged(category) ? 1 : 0.55,
                            cursor: isDraftChanged(category) ? "pointer" : "not-allowed",
                          }}
                          title="Применить цену override"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => resetOverrideDraft(category)}
                          disabled={!isDraftChanged(category)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            border: "1px solid #8b3f4d",
                            background: isDraftChanged(category) ? "#6f2c3b" : "#4d2730",
                            color: "#ffd9df",
                            fontSize: 11,
                            lineHeight: 1,
                            padding: 0,
                            opacity: isDraftChanged(category) ? 1 : 0.55,
                            cursor: isDraftChanged(category) ? "pointer" : "not-allowed",
                          }}
                          title="Отменить изменения override"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <span style={{ color: "#e5e2e1", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {formatPrice(effectivePrice(category))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
