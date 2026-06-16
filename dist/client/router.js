// Client-side router: navigate, Router/Routes/Route/Link, the location hooks,
// and the path-matching / base-path normalization helpers. Orthogonal to the
// transport and auth concerns.
import { createContext, h, toChildArray } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { basePath } from "./internal.js";
const RouterContext = createContext(null);
const RouteContext = createContext({ params: {} });
function appPathnameFromBrowserPathname(pathname) {
    const base = basePath();
    if (!base) {
        return pathname || "/";
    }
    if (pathname === base) {
        return "/";
    }
    if (pathname.startsWith(`${base}/`)) {
        return pathname.slice(base.length) || "/";
    }
    return pathname || "/";
}
function currentAppLocation() {
    if (typeof window === "undefined") {
        return { hash: "", href: "/", pathname: "/", search: "" };
    }
    const pathname = appPathnameFromBrowserPathname(window.location.pathname);
    const search = window.location.search;
    const hash = window.location.hash;
    return {
        hash,
        href: `${pathname}${search}${hash}`,
        pathname,
        search
    };
}
function isExternalHref(value) {
    return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith("//");
}
function browserHrefForAppHref(appHref) {
    const url = new URL(appHref, "http://lakebed.local/");
    const base = basePath();
    const pathname = base ? `${base}${url.pathname === "/" ? "/" : url.pathname}` : url.pathname;
    return `${pathname}${url.search}${url.hash}`;
}
function hrefForRoute(to) {
    const value = String(to ?? "");
    if (!value) {
        return browserHrefForAppHref(currentAppLocation().href);
    }
    if (isExternalHref(value)) {
        return value;
    }
    const current = currentAppLocation();
    const resolved = new URL(value, `http://lakebed.local${current.href}`);
    return browserHrefForAppHref(`${resolved.pathname}${resolved.search}${resolved.hash}`);
}
function emitLocationChange() {
    window.dispatchEvent(new Event("lakebed:locationchange"));
}
export function navigate(to, options = {}) {
    const href = hrefForRoute(to);
    const parsed = new URL(href, window.location.href);
    if (parsed.origin !== window.location.origin) {
        window.location.assign(parsed.toString());
        return;
    }
    const next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) {
        return;
    }
    if (options.replace) {
        window.history.replaceState({}, "", next);
    }
    else {
        window.history.pushState({}, "", next);
    }
    emitLocationChange();
}
function useBrowserLocation() {
    const [location, setLocation] = useState(currentAppLocation);
    useEffect(() => {
        function updateLocation() {
            setLocation(currentAppLocation());
        }
        window.addEventListener("popstate", updateLocation);
        window.addEventListener("lakebed:locationchange", updateLocation);
        return () => {
            window.removeEventListener("popstate", updateLocation);
            window.removeEventListener("lakebed:locationchange", updateLocation);
        };
    }, []);
    return location;
}
function normalizeMatchPath(path) {
    const value = String(path ?? "/").trim();
    if (value === "*" || value === "/*") {
        return "*";
    }
    const withSlash = value.startsWith("/") ? value : `/${value}`;
    return withSlash.length > 1 ? withSlash.replace(/\/+$/g, "") : "/";
}
function pathSegments(path) {
    const normalized = normalizeMatchPath(path);
    if (normalized === "*" || normalized === "/") {
        return [];
    }
    return normalized.replace(/^\/+|\/+$/g, "").split("/");
}
function decodeRouteSegment(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function matchRoutePath(pattern, pathname) {
    const normalizedPattern = normalizeMatchPath(pattern);
    if (normalizedPattern === "*") {
        return { params: {} };
    }
    const patternSegments = pathSegments(normalizedPattern);
    const pathnameSegments = pathSegments(pathname);
    const params = {};
    for (let index = 0; index < patternSegments.length; index += 1) {
        const patternSegment = patternSegments[index];
        const pathnameSegment = pathnameSegments[index];
        if (patternSegment === "*") {
            params["*"] = pathnameSegments.slice(index).map(decodeRouteSegment).join("/");
            return { params };
        }
        if (pathnameSegment === undefined) {
            return null;
        }
        if (patternSegment.startsWith(":")) {
            const name = patternSegment.slice(1);
            if (!name) {
                return null;
            }
            params[name] = decodeRouteSegment(pathnameSegment);
            continue;
        }
        if (patternSegment !== pathnameSegment) {
            return null;
        }
    }
    if (patternSegments.length !== pathnameSegments.length) {
        return null;
    }
    return { params };
}
function routeChildren(children) {
    const routes = [];
    for (const child of toChildArray(children)) {
        if (!child || typeof child !== "object") {
            continue;
        }
        const vnode = child;
        if (vnode.props?.path !== undefined) {
            routes.push(vnode);
            continue;
        }
        if (vnode.props?.children !== undefined) {
            routes.push(...routeChildren(vnode.props.children));
        }
    }
    return routes;
}
function shouldHandleLinkClick(event, target) {
    return (!event.defaultPrevented &&
        event.button === 0 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (!target || target === "_self") &&
        !event.currentTarget?.hasAttribute("download"));
}
export function Router({ children } = {}) {
    const location = useBrowserLocation();
    return h(RouterContext.Provider, { value: { location, navigate } }, children);
}
export function Routes({ children } = {}) {
    const location = useLocation();
    const routes = routeChildren(children);
    for (const route of routes) {
        const props = route.props;
        const match = matchRoutePath(props.path, location.pathname);
        if (!match) {
            continue;
        }
        return h(RouteContext.Provider, { value: match }, props.element ?? null);
    }
    return null;
}
export function Route(_props) {
    return null;
}
export function Link({ children, onClick, replace = false, target, to, ...props } = {}) {
    const href = hrefForRoute(to);
    return h("a", {
        ...props,
        href,
        onClick: (event) => {
            onClick?.(event);
            if (!shouldHandleLinkClick(event, target)) {
                return;
            }
            const parsed = new URL(href, window.location.href);
            if (parsed.origin !== window.location.origin) {
                return;
            }
            event.preventDefault();
            navigate(to, { replace });
        },
        target
    }, children);
}
export function useLocation() {
    const context = useContext(RouterContext);
    const fallback = useBrowserLocation();
    return context?.location ?? fallback;
}
export function useNavigate() {
    const context = useContext(RouterContext);
    return context?.navigate ?? navigate;
}
export function useParams() {
    return useContext(RouteContext).params;
}
//# sourceMappingURL=router.js.map