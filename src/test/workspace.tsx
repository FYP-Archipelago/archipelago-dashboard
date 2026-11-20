// Role queries walk the whole accessibility tree and cost up to a second each on a full page, so controls are found
// by their text or aria-label directly.
const named = (selector: string, name: string | RegExp) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find((element) => {
    const label = element.getAttribute('aria-label') ?? element.textContent ?? '';
    return typeof name === 'string' ? label === name : name.test(label);
  });

const findButton = (name: string | RegExp) => named('button', name) as HTMLButtonElement | undefined;

export function button(name: string | RegExp): HTMLButtonElement {
  const found = findButton(name);
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}
