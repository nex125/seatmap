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
  locale = "en-US",
  currency = "BYN",
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#dfcd72");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#dfcd72");
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
      const message = error instanceof Error ? error.message : "Failed to load prices.";
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

  return (
    <div className="seatmap-editor__panel" style={style}>
      <div className="seatmap-editor__panel-title">
        Pricing categories
      </div>

      {venue.categories.map((cat: PricingCategory) => {
        const isEditing = editingId === cat.id;
        return (
          <div
            key={cat.id}
            className="seatmap-editor__panel-list-item"
          >
            <span className="seatmap-editor__color-picker-shell">
              <span
                aria-hidden="true"
                className="seatmap-editor__color-picker-dot"
                style={{ background: isEditing ? editingColor : cat.color }}
              />
              <input
                type="color"
                value={isEditing ? editingColor : cat.color}
                onChange={(e) => isEditing && setEditingColor(e.target.value)}
                disabled={!isEditing}
                className="seatmap-editor__color-picker-input"
                data-editable={isEditing ? "true" : "false"}
                title={isEditing ? "Pick category color" : "Enable edit mode to change color"}
              />
            </span>
            {isEditing ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                className="seatmap-editor__panel-input seatmap-editor__panel-input--grow"
              />
            ) : (
              <div className="seatmap-editor__panel-text seatmap-editor__panel-text--truncate">
                {cat.name}
              </div>
            )}
            {isEditing ? (
              <>
                <button onClick={saveEdit} className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny">
                  Save
                </button>
                <button onClick={() => setEditingId(null)} className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="seatmap-editor__panel-muted seatmap-editor__panel-price">
                  {formatPrice(effectivePrice(cat))}
                </span>
                <button onClick={() => startEdit(cat)} className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny">
                  Edit
                </button>
                <button
                  onClick={() => removeCategory(cat.id)}
                  className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny"
                  disabled={venue.categories.length <= 1}
                  title={venue.categories.length <= 1 ? "At least one category is required" : "Delete category"}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        );
      })}

      <div className="seatmap-editor__panel-row seatmap-editor__panel-row--spaced">
        <span className="seatmap-editor__color-picker-shell seatmap-editor__color-picker-shell--lg">
          <span aria-hidden="true" className="seatmap-editor__color-picker-dot" style={{ background: newColor }} />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="seatmap-editor__color-picker-input"
            data-editable="true"
            title="Pick new category color"
          />
        </span>
        <input
          placeholder="Category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          className="seatmap-editor__panel-input seatmap-editor__panel-input--grow"
        />
        <button onClick={addCategory} className="seatmap-editor__panel-button">
          Add
        </button>
      </div>

      <div className="seatmap-editor__panel-actions-end">
        <button onClick={openPriceManager} className="seatmap-editor__panel-button">
          Manage prices
        </button>
      </div>

      {isPriceManagerOpen && (
        <div
          className="seatmap-editor__modal-backdrop"
          onClick={() => setIsPriceManagerOpen(false)}
        >
          <div
            className="seatmap-editor__modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="seatmap-editor__modal-header">
              <div className="seatmap-editor__panel-title">
                Category prices
              </div>
              <div className="seatmap-editor__modal-actions">
                <button
                  onClick={syncPricesFromBackend}
                  disabled={!fetchCategoryPrices || isFetchingPrices}
                  className="seatmap-editor__panel-button"
                  title={fetchCategoryPrices ? "Load latest prices from backend" : "Backend price sync is not configured"}
                >
                  {isFetchingPrices ? "Syncing..." : "Sync with backend"}
                </button>
                <button onClick={() => setIsPriceManagerOpen(false)} className="seatmap-editor__panel-button">
                  Close
                </button>
              </div>
            </div>

              <div className="seatmap-editor__panel-muted seatmap-editor__panel-muted--spaced">
              Backend prices are read-only. Override temporarily uses a custom category price for this seatmap.
            </div>
            <div
              className={
                syncStatus === "synced"
                  ? "seatmap-editor__status-line seatmap-editor__status-line--success"
                  : syncStatus === "failed"
                    ? "seatmap-editor__status-line seatmap-editor__status-line--error"
                    : "seatmap-editor__status-line seatmap-editor__status-line--idle"
              }
            >
              Sync status:{" "}
              {syncStatus === "not-synced"
                ? "Not synced"
                : syncStatus === "syncing"
                  ? "Syncing..."
                  : syncStatus === "synced"
                    ? "Synced"
                    : "Error"}
            </div>
            {fetchError && (
              <div className="seatmap-editor__status-line seatmap-editor__status-line--error">
                {fetchError}
              </div>
            )}

            <div className="seatmap-editor__table-grid">
              <div className="seatmap-editor__table-head">Category</div>
              <div className="seatmap-editor__table-head">Backend</div>
              <div className="seatmap-editor__table-head">Override</div>
              <div className="seatmap-editor__table-head">Override price</div>
              <div className="seatmap-editor__table-head">Effective price</div>

              {venue.categories.map((category) => (
                <div
                  key={category.id}
                  className="seatmap-editor__table-row"
                >
                  <div className="seatmap-editor__table-category-cell">
                    <span
                      className="seatmap-editor__table-category-swatch"
                      aria-hidden="true"
                      style={{ background: category.color }}
                    />
                    <span className="seatmap-editor__table-category-name">{category.name}</span>
                  </div>
                  <span className="seatmap-editor__table-amount">
                    {formatPrice(category.backendPrice)}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(category.isPriceOverridden)}
                    onClick={() => toggleOverride(category.id, !category.isPriceOverridden)}
                    className={`seatmap-editor__switch-track${category.isPriceOverridden ? " is-checked" : ""}`}
                    title={category.isPriceOverridden ? "Disable override" : "Enable override"}
                  >
                    <span className="seatmap-editor__switch-thumb" />
                  </button>
                  <div className="seatmap-editor__override-editor">
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
                      className={`seatmap-editor__override-input${category.isPriceOverridden ? "" : " is-disabled"}`}
                    />
                    {category.isPriceOverridden && (
                      <div className="seatmap-editor__override-actions">
                        <button
                          type="button"
                          onClick={() => adjustOverrideDraft(category.id, 0.01)}
                          className="seatmap-editor__table-action-button"
                          title="Increase override price"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustOverrideDraft(category.id, -0.01)}
                          className="seatmap-editor__table-action-button"
                          title="Decrease override price"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => commitOverridePrice(category.id)}
                          disabled={!isDraftChanged(category)}
                          className="seatmap-editor__table-action-button seatmap-editor__table-action-button--apply"
                          title="Apply override price"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => resetOverrideDraft(category)}
                          disabled={!isDraftChanged(category)}
                          className="seatmap-editor__table-action-button seatmap-editor__table-action-button--reset"
                          title="Revert override changes"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="seatmap-editor__table-effective-price">
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
