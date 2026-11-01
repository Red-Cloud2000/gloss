import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { navigate } from "./next-navigation";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string | { pathname?: string };
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

/** In-app links stay inside the desktop window. External links open as themselves. */
export default function Link({ href, children, onClick, prefetch: _prefetch, replace, scroll: _scroll, ...rest }: Props) {
  const to = typeof href === "string" ? href : href?.pathname || "/";
  return (
    <a
      href={to}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (rest.target && rest.target !== "_self") return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (/^[a-z]+:/i.test(to)) return;
        e.preventDefault();
        navigate(to, Boolean(replace));
      }}
    >
      {children}
    </a>
  );
}
