import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock window.scrollTo
Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });

// Mock Element.scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();
