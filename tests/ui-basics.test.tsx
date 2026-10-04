import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Logo,
  Select,
  Skeleton,
  Textarea,
  Toggle,
  cn,
} from "@/components/ui";

describe("cn", () => {
  it("merges and de-duplicates conflicting Tailwind classes", () => {
    expect(cn("px-2 text-sm", false && "hidden", "px-4")).toBe("text-sm px-4");
  });
});

describe("Button", () => {
  it("is a type=button by default and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);
    const btn = screen.getByRole("button", { name: "Run" });
    expect(btn).toHaveAttribute("type", "button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies variant and size classes", () => {
    render(
      <>
        <Button variant="primary" size="sm">
          P
        </Button>
        <Button variant="danger">D</Button>
        <Button variant="ghost" type="submit">
          G
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "P" }).className).toMatch(/bg-accent/);
    expect(screen.getByRole("button", { name: "P" }).className).toMatch(/h-8/);
    expect(screen.getByRole("button", { name: "D" }).className).toMatch(/text-danger/);
    expect(screen.getByRole("button", { name: "G" })).toHaveAttribute("type", "submit");
  });

  it("shows a loading state that disables the button", () => {
    const onClick = vi.fn();
    render(
      <Button loading icon={<span data-testid="icon" />} onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("icon")).toBeNull();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the icon when not loading", () => {
    render(<Button icon={<span data-testid="icon" />}>Go</Button>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).not.toHaveAttribute("aria-busy");
  });

  it("buttonClass builds classes for non-button elements", () => {
    expect(buttonClass()).toMatch(/border-border-strong/);
    expect(buttonClass("primary", "sm", "w-full")).toMatch(/w-full/);
  });
});

describe("Card / CardHeader", () => {
  it("renders the chosen element with header content", () => {
    const { container } = render(
      <Card as="section" padding="sm" aria-label="Box">
        <CardHeader
          title="Brief"
          description="What they agreed on"
          actions={<button>Act</button>}
          as="h3"
        />
        body
      </Card>,
    );
    const section = container.querySelector("section")!;
    expect(section.className).toMatch(/p-3/);
    expect(screen.getByRole("heading", { level: 3, name: "Brief" })).toBeInTheDocument();
    expect(screen.getByText("What they agreed on")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("defaults to a padded div with an h2 title", () => {
    const { container } = render(
      <Card>
        <CardHeader title="T" />
      </Card>,
    );
    expect(container.firstElementChild?.tagName).toBe("DIV");
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders tones", () => {
    render(
      <>
        <Badge>n</Badge>
        <Badge tone="success">s</Badge>
      </>,
    );
    expect(screen.getByText("n").className).toMatch(/text-fg-muted/);
    expect(screen.getByText("s").className).toMatch(/text-success/);
  });
});

describe("EmptyState", () => {
  it("renders title, description, icon and action", () => {
    render(
      <EmptyState
        icon={<svg data-testid="i" />}
        title="No runs yet"
        description="Run a question to see it here."
        action={<button>Start</button>}
        as="h3"
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No runs yet" })).toBeInTheDocument();
    expect(screen.getByText("Run a question to see it here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByTestId("i")).toBeInTheDocument();
  });

  it("renders with only a title", () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByRole("heading", { level: 2, name: "Empty" })).toBeInTheDocument();
  });
});

describe("Logo", () => {
  it("is decorative without a title", () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("circle")).toHaveLength(7);
  });

  it("is an image with a name when titled", () => {
    render(<Logo title="RoundTable" size={32} />);
    const img = screen.getByRole("img", { name: "RoundTable" });
    expect(img).toHaveAttribute("width", "32");
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild?.className).toMatch(/h-4/);
  });
});

describe("Toggle", () => {
  it("is a labelled switch with a description", () => {
    const onChange = vi.fn();
    render(
      <Toggle
        checked={false}
        onChange={onChange}
        label="Early stop"
        description="Stop when scores stop moving."
      />,
    );
    const sw = screen.getByRole("switch", { name: "Early stop" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAccessibleDescription("Stop when scores stop moving.");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("toggles off, and clicking the label activates it", () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Judge" id="judge" />);
    const sw = screen.getByRole("switch", { name: "Judge" });
    expect(sw).toHaveAttribute("id", "judge");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).not.toHaveAttribute("aria-describedby");
    fireEvent.click(screen.getByText("Judge"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Off" disabled />);
    const sw = screen.getByRole("switch", { name: "Off" });
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Field", () => {
  it("wires label, help and error to the control", () => {
    render(
      <Field label="Question" help="Up to 10,000 characters." error="Required" required>
        <Textarea />
      </Field>,
    );
    const ta = screen.getByRole("textbox", { name: /Question/ });
    expect(ta).toHaveAccessibleDescription("Up to 10,000 characters. Required");
    expect(ta).toHaveAttribute("aria-invalid", "true");
    expect(ta).toBeRequired();
  });

  it("keeps the child's id and existing aria-describedby", () => {
    render(
      <>
        <p id="extra">Extra</p>
        <Field label="Cap" aside="USD">
          <Input id="cap" aria-describedby="extra" />
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Cap" });
    expect(input).toHaveAttribute("id", "cap");
    expect(input).toHaveAttribute("aria-describedby", "extra");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("USD")).toBeInTheDocument();
  });

  it("supports a render function", () => {
    render(
      <Field label="Judge model" id="judge-model" help="Used for synthesis.">
        {({ id, describedBy, invalid }) => (
          <Select id={id} aria-describedby={describedBy} aria-invalid={invalid}>
            <option>a</option>
          </Select>
        )}
      </Field>,
    );
    const select = screen.getByRole("combobox", { name: "Judge model" });
    expect(select).toHaveAttribute("id", "judge-model");
    expect(select).toHaveAccessibleDescription("Used for synthesis.");
  });

  it("generates an id when none is given and omits describedby without help", () => {
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.id).toMatch(/^field-/);
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});
