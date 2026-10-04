import { describe, it, expect, vi, afterEach } from "vitest";
import { useRef, useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Menu, Popover, type MenuItem } from "@/components/ui";

const rect = (r: Partial<DOMRect>): DOMRect =>
  ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, ...r }) as DOMRect;

function items(overrides: Partial<Record<string, Partial<MenuItem>>> = {}) {
  const onMarkdown = vi.fn();
  const onJson = vi.fn();
  const onCopy = vi.fn();
  const list: MenuItem[] = [
    { id: "md", label: "Markdown", description: "Readable export", onSelect: onMarkdown },
    { id: "json", label: "JSON", icon: <span>{"{}"}</span>, onSelect: onJson },
    { id: "off", label: "Disabled", onSelect: vi.fn(), disabled: true },
    { id: "copy", label: "Copy permalink", onSelect: onCopy, danger: true },
  ].map((i) => ({ ...i, ...(overrides[i.id] ?? {}) }));
  return { list, onMarkdown, onJson, onCopy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Menu", () => {
  it("opens a portal menu on click and focuses the first item", () => {
    const { list } = items();
    const { container } = render(<Menu label="Export" items={list} />);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Export" });
    expect(container.contains(menu)).toBe(false); // portalled to <body>
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    expect(screen.getByRole("menuitem", { name: /Markdown/ })).toHaveFocus();
    expect(screen.getByText("Readable export")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Copy permalink/ }).className).toMatch(
      /text-danger/,
    );
  });

  it("navigates with arrows / Home / End, skipping disabled items", () => {
    const { list } = items();
    render(<Menu label="Export" items={list} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /JSON/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Markdown/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: /Markdown/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "x" });
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus();
  });

  it("selecting an item restores focus before running the action, then closes", () => {
    const { list, onJson } = items();
    render(<Menu label="Export" items={list} />);
    const trigger = screen.getByRole("button", { name: "Export" });
    onJson.mockImplementation(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /JSON/ }));
    expect(onJson).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape (without bubbling to window) and returns focus", () => {
    const { list } = items();
    const windowEscape = vi.fn();
    window.addEventListener("keydown", windowEscape);
    try {
      render(<Menu label="Export" items={list} />);
      const trigger = screen.getByRole("button", { name: "Export" });
      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(trigger).toHaveFocus();
      expect(windowEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowEscape);
    }
  });

  it("closes on Tab and on outside click, but not on clicks inside", () => {
    const { list } = items();
    render(
      <>
        <Menu label="Export" items={list} />
        <p>outside</p>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Export" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("menu"));
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("toggles closed when the trigger is clicked again", () => {
    render(<Menu label="Export" items={items().list} />);
    const trigger = screen.getByRole("button", { name: "Export" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens from the keyboard: ↓/Enter/Space on the first item, ↑ on the last", () => {
    render(<Menu label="Export" items={items().list} />);
    const trigger = screen.getByRole("button", { name: "Export" });
    for (const key of ["ArrowDown", "Enter", " "]) {
      fireEvent.keyDown(trigger, { key });
      expect(screen.getByRole("menuitem", { name: /Markdown/ })).toHaveFocus();
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    }
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.keyDown(trigger, { key: "a" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders checkable items as menuitemradio and supports icon-only triggers", () => {
    const onPick = vi.fn();
    render(
      <Menu
        label={<span aria-hidden>⋯</span>}
        aria-label="Persona"
        chevron={false}
        variant="ghost"
        size="sm"
        align="end"
        matchTriggerWidth
        items={[
          { id: "a", label: "Risk Analyst", checked: true, onSelect: onPick },
          { id: "b", label: "Optimist", checked: false, onSelect: onPick },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Persona" }));
    expect(screen.getByRole("menu", { name: "Persona" })).toBeInTheDocument();
    const a = screen.getByRole("menuitemradio", { name: "Risk Analyst" });
    expect(a).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Optimist" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("does not open when disabled, and tolerates an empty item list", () => {
    const { rerender } = render(<Menu label="Export" items={items().list} disabled />);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    rerender(<Menu label="Export" items={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

function PopoverHarness({
  align,
  anchorRect,
}: {
  align?: "start" | "end";
  anchorRect: Partial<DOMRect>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={(el) => {
          ref.current = el;
          if (el) el.getBoundingClientRect = () => rect(anchorRect);
        }}
        onClick={() => setOpen(true)}
      >
        anchor
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        align={align}
        restoreFocus={false}
        aria-label="Pop"
      >
        content
      </Popover>
    </>
  );
}

describe("Popover positioning", () => {
  const size = (w: number, h: number) => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(w);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(h);
  };

  it("places below the anchor, aligned to its start", () => {
    size(100, 50);
    render(
      <PopoverHarness anchorRect={{ left: 20, right: 120, top: 10, bottom: 40, width: 100 }} />,
    );
    fireEvent.click(screen.getByText("anchor"));
    const pop = screen.getByRole("dialog", { name: "Pop" });
    expect(pop.style.top).toBe("44px");
    expect(pop.style.left).toBe("20px");
    expect(pop.style.visibility).toBe("visible");
  });

  it("aligns to the end edge and flips above when there is no room below", () => {
    size(100, 200);
    const vh = window.innerHeight;
    render(
      <PopoverHarness
        align="end"
        anchorRect={{ left: 300, right: 400, top: vh - 30, bottom: vh - 5, width: 100 }}
      />,
    );
    fireEvent.click(screen.getByText("anchor"));
    const pop = screen.getByRole("dialog");
    expect(pop.style.left).toBe("300px");
    expect(pop.style.top).toBe(`${vh - 30 - 4 - 200}px`);
  });

  it("clamps into the viewport and repositions on resize", () => {
    size(200, 50);
    render(
      <PopoverHarness anchorRect={{ left: -50, right: 10, top: 10, bottom: 30, width: 60 }} />,
    );
    fireEvent.click(screen.getByText("anchor"));
    const pop = screen.getByRole("dialog");
    expect(pop.style.left).toBe("8px");
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(pop.style.left).toBe("8px");
  });

  it("closes on outside touch", () => {
    size(10, 10);
    render(<PopoverHarness anchorRect={{}} />);
    fireEvent.click(screen.getByText("anchor"));
    fireEvent.touchStart(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
