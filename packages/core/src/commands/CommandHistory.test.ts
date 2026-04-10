import { describe, expect, test } from "bun:test";
import { CommandHistory, type Command } from "./CommandHistory";

function makeCommand(target: { value: number }, amount: number): Command {
  return {
    description: `add ${amount}`,
    execute: () => {
      target.value += amount;
    },
    undo: () => {
      target.value -= amount;
    },
  };
}

describe("CommandHistory", () => {
  test("tracks execute, undo, and redo transitions", () => {
    const history = new CommandHistory();
    const state = { value: 0 };

    history.execute(makeCommand(state, 2));
    history.execute(makeCommand(state, 3));
    expect(state.value).toBe(5);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.undo();
    expect(state.value).toBe(2);
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(state.value).toBe(5);
    expect(history.canUndo).toBe(true);
  });

  test("clears redo stack after a new execute", () => {
    const history = new CommandHistory();
    const state = { value: 0 };

    history.execute(makeCommand(state, 1));
    history.execute(makeCommand(state, 1));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.execute(makeCommand(state, 5));
    expect(history.canRedo).toBe(false);
    expect(state.value).toBe(6);
  });

  test("notifies subscribers on state mutations", () => {
    const history = new CommandHistory();
    const state = { value: 0 };
    let notifications = 0;
    const unsubscribe = history.subscribe(() => {
      notifications += 1;
    });

    history.execute(makeCommand(state, 1));
    history.undo();
    history.redo();
    history.clear();
    unsubscribe();
    history.execute(makeCommand(state, 1));

    expect(notifications).toBe(4);
  });
});
