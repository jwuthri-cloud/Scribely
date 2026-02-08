/**
 * Example component tests demonstrating React Testing Library patterns.
 *
 * This file shows common testing patterns for Next.js components:
 * - Rendering components
 * - Querying elements
 * - Simulating user interactions
 * - Testing async behavior
 * - Mocking modules
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Example: Simple button component for demonstration
function CounterButton({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = React.useState(initialCount);

  return (
    <button onClick={() => setCount((c) => c + 1)}>
      Count: {count}
    </button>
  );
}

// Need to import React for the component above
import React from "react";

describe("CounterButton", () => {
  it("should render with initial count", () => {
    render(<CounterButton initialCount={5} />);

    expect(screen.getByRole("button")).toHaveTextContent("Count: 5");
  });

  it("should increment count on click", async () => {
    const user = userEvent.setup();
    render(<CounterButton />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Count: 0");

    await user.click(button);
    expect(button).toHaveTextContent("Count: 1");

    await user.click(button);
    expect(button).toHaveTextContent("Count: 2");
  });
});

// Example: Component with async behavior
function AsyncGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setGreeting(`Hello, ${name}!`);
      setLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [name]);

  if (loading) {
    return <div role="status">Loading...</div>;
  }

  return <div data-testid="greeting">{greeting}</div>;
}

describe("AsyncGreeting", () => {
  it("should show loading state initially", () => {
    render(<AsyncGreeting name="World" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("should show greeting after loading", async () => {
    render(<AsyncGreeting name="World" />);

    await waitFor(() => {
      expect(screen.getByTestId("greeting")).toHaveTextContent("Hello, World!");
    });
  });
});

// Example: Form component
function LoginForm({ onSubmit }: { onSubmit: (data: { email: string; password: string }) => void }) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onSubmit({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required />

      <button type="submit">Sign In</button>
    </form>
  );
}

describe("LoginForm", () => {
  it("should call onSubmit with form data", async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("should have accessible form fields", () => {
    render(<LoginForm onSubmit={jest.fn()} />);

    // Labels should be associated with inputs
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

    // Inputs should have correct types
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
  });
});

// Example: Testing with mocked context
const ThemeContext = React.createContext<"light" | "dark">("light");

function ThemedComponent() {
  const theme = React.useContext(ThemeContext);
  return <div data-testid="themed">Current theme: {theme}</div>;
}

describe("ThemedComponent", () => {
  it("should use default light theme", () => {
    render(<ThemedComponent />);
    expect(screen.getByTestId("themed")).toHaveTextContent("Current theme: light");
  });

  it("should use provided dark theme", () => {
    render(
      <ThemeContext.Provider value="dark">
        <ThemedComponent />
      </ThemeContext.Provider>
    );
    expect(screen.getByTestId("themed")).toHaveTextContent("Current theme: dark");
  });
});
