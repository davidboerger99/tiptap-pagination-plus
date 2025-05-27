import { Extension } from "@tiptap/core";
interface PaginationPlusOptions {
    pageHeight: number;
    pageGap: number;
    pageBreakBackground: string;
    pageHeaderHeight: number;
    pageFooterHeight: number;
    pageMarginLeft: number;
    pageMarginRight: number;
    pageGapBorderSize: number;
    footerText: string | string[] | ((pageNumber: number) => string);
}
interface MarginUpdate {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        paginationPlus: {
            updatePageMargins: (margins: MarginUpdate) => ReturnType;
            refreshPagination: () => ReturnType;
        };
    }
}
export declare const PaginationPlus: Extension<PaginationPlusOptions, any>;
export {};
