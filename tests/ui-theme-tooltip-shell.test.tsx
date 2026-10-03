import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  THEME_STORAGE_KEY,
  ThemeToggle,
  Tooltip,
  nextThemePreference,
  readThemePreference,
  setThemePreference,
} from "@/components/ui";
import { THEME_INIT_SCRIPT } from "@/components/ui/theme-script";
import AppShell from "@/components/AppShell";
import { useArenaStore } from "@/lib/store";

const root = () => document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  root().removeAttribute("data-theme");
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("theme helpers", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("reads the saved preference, ignoring junk", () => {
    expect(readThemePreference()).toBe("system");
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readThemePreference()).toBe("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readThemePreference()).toBe("system");
  });

  it("applies and persists preferences; system removes both", () => {
    setThemePreference("dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    setThemePreference("system");
    expect(root()).not.toHaveAttribute("data-theme");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    setThemePreference("bogus" as never);
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readThemePreference()).toBe("system");
    expect(() => setThemePreference("light")).not.toThrow();
    expect(root()).toHaveAttribute("data-theme", "light");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it("applies a saved light/dark choice before paint", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("leaves the attribute unset when nothing valid is saved", () => {
    run();
    expect(root()).not.toHaveAttribute("data-theme");
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    run();
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("swallows storage errors", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(run).not.toThrow();
  });
});

describe("ThemeToggle", () => {
  it("cycles the theme and updates its label", () => {
    render(<ThemeToggle showLabel />);
    const btn = screen.getByRole("button", { name: /Theme: System/ });
    expect(btn).toHaveTextContent("System");
    fireEvent.click(btn);
    expect(root()).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: "Theme: Light. Switch to dark." })).toBeTruthy();
    fireEvent.click(btn);
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    fireEvent.click(btn);
    expect(root()).not.toHaveAttribute("data-theme");
    expect(screen.getByRole("button", { name: /Theme: System/ })).toBeTruthy();
  });

  it("follows changes made in another tab", () => {
    render(<ThemeToggle />);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: /Theme: Dark/ })).toBeTruthy();
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(root()).not.toHaveAttribute("data-theme");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    });
    expect(screen.getByRole("button", { name: /Theme: System/ })).toBeTruthy();
  });
});

describe("Tooltip", () => {
  it("describes its trigger and shows on hover / focus", () => {
    render(
      <>
        <span id="pre">Existing</span>
        <Tooltip content="Average confidence minus half the spread">
          <button aria-describedby="pre">Score</button>
        </Tooltip>
      </>,
    );
    const btn = screen.getByRole("button", { name: "Score" });
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(btn.getAttribute("aria-describedby")).toBe(`pre ${tip.id}`);
    expect(btn).toHaveAccessibleDescription("Existing Average confidence minus half the spread");
    expect(tip).not.toBeVisible();

    fireEvent.mouseEnter(btn.parentElement!);
    expect(tip).toBeVisible();
    fireEvent.mouseLeave(btn.parentElement!);
    expect(tip).not.toBeVisible();

    fireEvent.focus(btn);
    expect(tip).toBeVisible();
    fireEvent.blur(btn);
    expect(tip).not.toBeVisible();
  });

  it("closes on Escape without bubbling", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Tooltip content="Help" side="bottom">
          <button>Info</button>
        </Tooltip>
      </div>,
    );
    const btn = screen.getByRole("button", { name: "Info" });
    fireEvent.keyDown(btn, { key: "Escape" }); // closed: bubbles
    expect(outer).toHaveBeenCalledTimes(1);
    fireEvent.focus(btn);
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("Escape also closes a hover-only tooltip, without reaching the window", () => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(
        <Tooltip content="Help">
          <button>Info</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button", { name: "Info" });
      fireEvent.mouseEnter(btn.parentElement!);
      expect(screen.getByRole("tooltip")).toBeVisible();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });
});

describe("AppShell", () => {
  beforeEach(() => {
    useArenaStore.setState({ view: "setup" });
  });

  it("renders the brand, view switch, theme toggle and the active view", () => {
    render(
      <AppShell historyCount={3} headerActions={<button>Stop</button>}>
        <p>setup content</p>
      </AppShell>,
    );
    expect(screen.getByRole("banner")).toHaveTextContent("RoundTable");
    expect(screen.getByRole("tablist", { name: "Views" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Setup" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "History 3 saved runs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Theme:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    const panel = screen.getByRole("tabpanel", { name: "Setup" });
    expect(panel).toHaveTextContent("setup content");
    expect(screen.getByRole("main")).toContainElement(panel);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#rt-main",
    );
  });

  it("switches the store view from the tabs", () => {
    render(<AppShell>x</AppShell>);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(useArenaStore.getState().view).toBe("history");
    expect(screen.getByRole("tabpanel", { name: "History" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(useArenaStore.getState().view).toBe("setup");
  });

  it("hides the badge for zero runs and uses the singular for one", () => {
    const { rerender } = render(<AppShell historyCount={0}>x</AppShell>);
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
    rerender(<AppShell historyCount={1}>x</AppShell>);
    expect(screen.getByRole("tab", { name: "History 1 saved run" })).toBeInTheDocument();
  });
});
