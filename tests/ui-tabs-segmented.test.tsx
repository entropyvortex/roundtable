import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Segmented,
  TabPanel,
  Tabs,
  tabId,
  tabPanelId,
  type TabItem,
  type TabsProps,
} from "@/components/ui";

const ITEMS: TabItem[] = [
  { id: "brief", label: "Brief" },
  { id: "transcript", label: "Transcript", badge: <span>4</span> },
  { id: "hidden", label: "Hidden", disabled: true },
  { id: "signals", label: "Signals" },
];

interface TabsHarnessProps {
  initial?: string;
  onChange?: (id: string) => void;
  variant?: TabsProps["variant"];
}

function TabsHarness({
  initial = "brief",
  onChange = vi.fn(),
  variant = "underline",
}: TabsHarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Tabs
        items={ITEMS}
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        label="Panes"
        idBase="t"
        variant={variant}
      />
      <TabPanel idBase="t" id={value}>
        panel {value}
      </TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("exposes tablist / tab / tabpanel semantics", () => {
    render(<TabsHarness />);
    expect(screen.getByRole("tablist", { name: "Panes" })).toBeInTheDocument();
    const brief = screen.getByRole("tab", { name: "Brief" });
    expect(brief).toHaveAttribute("aria-selected", "true");
    expect(brief).toHaveAttribute("tabindex", "0");
    expect(brief).toHaveAttribute("aria-controls", tabPanelId("t", "brief"));
    const other = screen.getByRole("tab", { name: "Transcript 4" });
    expect(other).toHaveAttribute("tabindex", "-1");
    expect(other).not.toHaveAttribute("aria-controls");
    expect(screen.getByRole("tabpanel", { name: "Brief" })).toHaveTextContent("panel brief");
    expect(brief.id).toBe(tabId("t", "brief"));
  });

  it("moves with arrow keys, skipping disabled tabs, and wraps", () => {
    const onChange = vi.fn();
    render(<TabsHarness onChange={onChange} />);
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("transcript");
    expect(screen.getByRole("tab", { name: /Transcript/ })).toHaveFocus();
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("signals");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("brief");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("signals");
    fireEvent.keyDown(list, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("brief");
    fireEvent.keyDown(list, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("signals");
    const calls = onChange.mock.calls.length;
    fireEvent.keyDown(list, { key: "End" }); // already there → no change event
    fireEvent.keyDown(list, { key: "a" });
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it("selects on click but not when already selected", () => {
    const onChange = vi.fn();
    render(<TabsHarness onChange={onChange} variant="pill" />);
    fireEvent.click(screen.getByRole("tab", { name: "Brief" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Signals" }));
    expect(onChange).toHaveBeenCalledWith("signals");
    expect(screen.getByRole("tab", { name: "Hidden" })).toBeDisabled();
  });

  it("makes the first enabled tab focusable when the value is unknown or disabled", () => {
    const { rerender } = render(
      <Tabs items={ITEMS} value="hidden" onChange={() => {}} label="x" idBase="t" />,
    );
    expect(screen.getByRole("tab", { name: "Brief" })).toHaveAttribute("tabindex", "0");
    const onChange = vi.fn();
    rerender(
      <Tabs
        items={[{ id: "a", label: "A", disabled: true }]}
        value="a"
        onChange={onChange}
        label="x"
        idBase="t"
      />,
    );
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("tabindex", "-1");
  });
});

function SegHarness({ onChange = vi.fn(), initial = "r1" }) {
  const [value, setValue] = useState(initial);
  return (
    <Segmented
      label="Round"
      size="sm"
      fullWidth
      value={value}
      onChange={(v) => {
        onChange(v);
        setValue(v);
      }}
      options={[
        { value: "r1", label: "R1 Initial", description: "62" },
        { value: "r2", label: "R2 Counter", description: 0 },
        { value: "r3", label: "R3 Evidence", disabled: true },
        { value: "r4", label: "R4 Synthesis" },
      ]}
    />
  );
}

describe("Segmented", () => {
  it("uses radiogroup semantics with descriptions", () => {
    render(<SegHarness />);
    expect(screen.getByRole("radiogroup", { name: "Round" })).toBeInTheDocument();
    const r1 = screen.getByRole("radio", { name: /R1 Initial/ });
    expect(r1).toHaveAttribute("aria-checked", "true");
    expect(r1).toHaveAttribute("tabindex", "0");
    expect(r1).toHaveTextContent("62");
    expect(screen.getByRole("radio", { name: /R2 Counter/ })).toHaveTextContent("0");
    expect(screen.getByRole("radio", { name: /R2/ })).toHaveAttribute("tabindex", "-1");
  });

  it("moves with arrows (both axes), Home and End, skipping disabled options", () => {
    const onChange = vi.fn();
    render(<SegHarness onChange={onChange} />);
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("r2");
    expect(screen.getByRole("radio", { name: /R2/ })).toHaveFocus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("r4");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("r2");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("r1");
    fireEvent.keyDown(group, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("r4");
    fireEvent.keyDown(group, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("r1");
    const n = onChange.mock.calls.length;
    fireEvent.keyDown(group, { key: "Home" });
    fireEvent.keyDown(group, { key: "x" });
    expect(onChange).toHaveBeenCalledTimes(n);
  });

  it("selects on click, ignoring the already-checked option", () => {
    const onChange = vi.fn();
    render(<SegHarness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /R1/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /R4/ }));
    expect(onChange).toHaveBeenCalledWith("r4");
  });

  it("falls back to the first enabled option for focus and ignores keys with no options", () => {
    const { rerender } = render(
      <Segmented
        label="x"
        value="zzz"
        onChange={() => {}}
        options={[
          { value: "a", label: "A", disabled: true },
          { value: "b", label: "B" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("tabindex", "0");
    const onChange = vi.fn();
    rerender(<Segmented label="x" value="a" onChange={onChange} options={[]} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
