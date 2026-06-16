import type { ComponentChildren, VNode } from "preact";
export interface AppLocation {
    hash: string;
    href: string;
    pathname: string;
    search: string;
}
export declare function navigate(to: string, options?: {
    replace?: boolean;
}): void;
export interface RouterProps {
    children?: ComponentChildren;
}
export interface RouteProps {
    path: string;
    element: ComponentChildren;
}
export interface LinkProps {
    children?: ComponentChildren;
    onClick?: (event: Event) => void;
    replace?: boolean;
    target?: string;
    to: string;
    [prop: string]: unknown;
}
export declare function Router({ children }?: RouterProps): VNode<any>;
export declare function Routes({ children }?: RouterProps): VNode<any> | null;
export declare function Route(_props: RouteProps): VNode<any> | null;
export declare function Link({ children, onClick, replace, target, to, ...props }?: LinkProps): VNode<any>;
export declare function useLocation(): AppLocation;
export declare function useNavigate(): typeof navigate;
export declare function useParams<TParams = Record<string, string | undefined>>(): TParams;
//# sourceMappingURL=router.d.ts.map