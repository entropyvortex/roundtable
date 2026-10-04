import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { resetStore } from "./helpers/store";
import CompareEngines from "@/components/run/CompareEngines";
import type { SessionSnapshot } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("CompareEngines", () => {
  beforeEach(resetStore);

  it("renders nothing outside a sweep", () => {
    const { container } = render(<CompareEngines onOpenSnapshot={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("compares two finished engines and opens one", () => {
    const s = useArenaStore.getState();
    s.startSweep(["cvp", "blind-jury"]);
    s.pushSweepResult(FIXTURE_SNAPSHOT);
    s.pushSweepResult(FIXTURE_SNAPSHOT_JURY);
    const onOpen = vi.fn();
    render(<CompareEngines onOpenSnapshot={onOpen} />);

    expect(screen.getByRole("region", { name: "Compare engines" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2 done")).toBeInTheDocument();
    const [cvp, jury] = bodyRows();

    expect(within(cvp).getByRole("rowheader")).toHaveTextContent("Debate (CVP)");
    expect(within(cvp).getByText("80")).toBeInTheDocument();
    expect(within(cvp).getByText("Strong agreement")).toBeInTheDocument();
    const cvpCells = within(cvp)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cvpCells[1]).toBe("2"); // contradictions
    expect(cvpCells[2]).toBe("4"); // spread flags
    expect(cvpCells[3]).toMatch(/^Start with a modular monolith/);
    expect(cvpCells[4]).toBe("$0.13");
    expect(cvpCells[5]).toBe("42,700");

    expect(within(jury).getByRole("rowheader")).toHaveTextContent("Blind jury");
    expect(within(jury).getByText("74")).toBeInTheDocument();
    expect(within(jury).getByText("Broad agreement with reservations")).toBeInTheDocument();
    const juryCells = within(jury)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(juryCells[1]).toBe("1");
    expect(juryCells[2]).toBe("1");
    expect(juryCells[4]).toBe("$0.03");
    expect(juryCells[5]).toBe("7,230");

    fireEvent.click(within(jury).getByRole("button", { name: "Open Blind jury run" }));
    expect(onOpen).toHaveBeenCalledWith(FIXTURE_SNAPSHOT_JURY);
  });

  it("shows running, queued and stopped engines as status rows", () => {
    const s = useArenaStore.getState();
    s.startSweep(["cvp", "blind-jury", "adversarial"]);
    s.pushSweepResult(FIXTURE_SNAPSHOT);
    s.setSweepCurrentIndex(1);
    s.startConsensus();
    const { rerender } = render(<CompareEngines onOpenSnapshot={vi.fn()} />);
    let rows = bodyRows();
    expect(rows[1]).toHaveTextContent("Running…");
    expect(rows[2]).toHaveTextContent("Queued");
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();

    // The engine errored: sweep stays active but nothing is running.
    s.failConsensus("boom");
    rerender(<CompareEngines onOpenSnapshot={vi.fn()} />);
    rows = bodyRows();
    expect(rows[1]).toHaveTextContent("Stopped before finishing");
    expect(rows[2]).toHaveTextContent("Not run");
  });

  it("keeps finished engines after a cancelled sweep and handles missing data", () => {
    const bare: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT_JURY,
      engine: "adversarial",
      finalScore: null,
      judge: null,
      claims: { ...FIXTURE_SNAPSHOT.claims!, error: "timeout" },
      tokenTotal: null,
      options: { ...FIXTURE_SNAPSHOT_JURY.options, judgeEnabled: false },
    };
    const s = useArenaStore.getState();
    s.startSweep(["adversarial", "cvp"]);
    s.pushSweepResult(bare);
    s.pushSweepResult({ ...bare, claims: null, options: { ...bare.options, judgeEnabled: true } });
    s.cancelSweep();
    render(<CompareEngines onOpenSnapshot={vi.fn()} />);
    const [a, b] = bodyRows();
    expect(within(a).getByRole("rowheader")).toHaveTextContent("Red team");
    const cells = within(a)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["—", "Failed", "1", "Judge off", "—", "—", "Open"]);
    const cellsB = within(b)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cellsB[1]).toBe("—");
    expect(cellsB[3]).toBe("No verdict");
  });
});
