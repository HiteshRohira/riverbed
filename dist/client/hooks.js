// Data hooks built on top of the WebSocket transport.
import { useEffect, useState } from "preact/hooks";
import { addQueryListener, connect, getQueryValue, removeQueryListener, request, send } from "./transport.js";
export function useQuery(name) {
    const [value, setValue] = useState(getQueryValue(name) ?? []);
    useEffect(() => {
        connect();
        addQueryListener(name, setValue);
        send({ op: "query.subscribe", name });
        return () => {
            removeQueryListener(name, setValue);
        };
    }, [name]);
    return value;
}
export function useMutation(name) {
    return (...args) => request("mutation.run", { name, args });
}
//# sourceMappingURL=hooks.js.map