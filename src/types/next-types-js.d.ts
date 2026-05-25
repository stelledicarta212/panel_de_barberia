declare module "next/types.js" {
  export type ResolvingMetadata = unknown;
  export type ResolvingViewport = unknown;
}

declare module "next" {
  export type NextConfig = Record<string, unknown>;
  export type Metadata = Record<string, unknown>;
}

declare module "next/server.js" {
  export type NextRequest = Request & {
    nextUrl: URL;
  };
}

declare module "next/server" {
  export type NextRequest = Request & {
    nextUrl: URL;
  };

  export class NextResponse extends Response {
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
  }
}

declare module "next/link" {
  import type { AnchorHTMLAttributes, ReactNode } from "react";

  export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: ReactNode;
  };

  export default function Link(props: LinkProps): ReactNode;
}

declare module "next/navigation" {
  export function usePathname(): string;
  export function redirect(path: string): never;
  export function useRouter(): {
    push: (href: string) => void;
    replace: (href: string) => void;
    refresh: () => void;
    back: () => void;
    forward: () => void;
  };
}
