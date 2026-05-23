import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App", () => {
  it("loads the simulator and responds to play controls", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Physarum Lab")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText(/agents/i).length).toBeGreaterThan(0));
    const pause = await screen.findByRole("button", { name: /Pause/i });
    fireEvent.click(pause);
    expect(await screen.findByRole("button", { name: /Play/i })).toBeInTheDocument();
  });

  it("shows formula panel", async () => {
    render(<App />);
    const formula = await screen.findByRole("button", { name: /Formula/i });
    fireEvent.click(formula);
    expect(await screen.findByText("Food attractant")).toBeInTheDocument();
  });
});
