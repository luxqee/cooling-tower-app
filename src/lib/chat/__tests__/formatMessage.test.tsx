import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderFormattedMessage } from "../formatMessage";

function renderToHtml(content: string): string {
  return renderToStaticMarkup(renderFormattedMessage(content));
}

describe("renderFormattedMessage", () => {
  it("renders plain text with no formatting as-is, with no <strong>", () => {
    const html = renderToHtml("Job 123 is complete.");
    expect(html).toContain("Job 123 is complete.");
    expect(html).not.toContain("<strong>");
  });

  it("renders a single bold span as <strong>", () => {
    const html = renderToHtml("The job is **Job 123**.");
    expect(html).toContain("<strong>Job 123</strong>");
  });

  it("renders multiple bold spans in one line", () => {
    const html = renderToHtml("**Job A** and **Job B** are active.");
    expect(html).toContain("<strong>Job A</strong>");
    expect(html).toContain("<strong>Job B</strong>");
  });

  it("renders a bullet list as <ul><li>", () => {
    const html = renderToHtml("Active jobs:\n- Job A\n- Job B");
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toContain("Job A");
    expect(html).toContain("Job B");
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(2);
  });

  it("renders mixed paragraph and bullet list content, with the surrounding text preserved", () => {
    const html = renderToHtml(
      "Here are the jobs:\n\n- Job A\n- Job B\n\nLet me know if you need more."
    );
    expect(html).toMatch(/<p[^>]*>/);
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toContain("Here are the jobs:");
    expect(html).toContain("Let me know if you need more.");
  });

  it("leaves an unmatched lone ** as literal text, not a <strong>", () => {
    const html = renderToHtml("This has a lone ** marker in it.");
    expect(html).toContain("**");
    expect(html).not.toContain("<strong>");
  });

  it("does not treat a bold-opening line as a bullet list item", () => {
    const html = renderToHtml("**Job A** is currently active.");
    expect(html).not.toMatch(/<ul[^>]*>/);
    expect(html).toContain("<strong>Job A</strong>");
  });
});
