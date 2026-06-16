export declare const root: string;
export declare function usage(): void;
export declare function readArg(args: string[], name: string, fallback?: string): string | undefined;
export declare const optionsWithValues: Set<string>;
export declare function positionals(args: string[]): string[];
export declare function readNumberArg(args: string[], name: string, fallback: number): number;
export declare function hasFlag(args: string[], name: string): boolean;
export declare function resolveCapsuleDir(value?: string): string;
export declare function shellQuote(value: string): string;
//# sourceMappingURL=args.d.ts.map