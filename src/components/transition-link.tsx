"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { shouldShowNavigationTransition } from "@/lib/navigation-transition";
import { useNavigationTransition } from "@/components/navigation-transition-provider";

type TransitionLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> & {
    children: ReactNode;
    disabled?: boolean;
  };

function getCurrentUrl(): string {
  if (typeof window === "undefined") return "http://localhost/";
  return window.location.href;
}

export function TransitionLink({
  children,
  disabled,
  href,
  onClick,
  target,
  download,
  ...props
}: TransitionLinkProps) {
  const { startTransition } = useNavigationTransition();
  const hrefValue = String(href);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    const decision = shouldShowNavigationTransition({
      href: hrefValue,
      currentUrl: getCurrentUrl(),
      target,
      download,
      disabled,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey
    });

    if (decision.shouldTransition) {
      startTransition(decision.message);
    }
  }

  return (
    <Link
      {...props}
      href={href}
      target={target}
      download={download}
      aria-disabled={disabled || props["aria-disabled"]}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}

type TransitionAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  disabled?: boolean;
};

export function TransitionAnchor({
  children,
  disabled,
  href = "",
  onClick,
  target,
  download,
  ...props
}: TransitionAnchorProps) {
  const { startTransition } = useNavigationTransition();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    const decision = shouldShowNavigationTransition({
      href,
      currentUrl: getCurrentUrl(),
      target,
      download,
      disabled: disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true",
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey
    });

    if (decision.shouldTransition) {
      startTransition(decision.message);
    }
  }

  return (
    <a
      {...props}
      href={href}
      target={target}
      download={download}
      aria-disabled={disabled || props["aria-disabled"]}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
