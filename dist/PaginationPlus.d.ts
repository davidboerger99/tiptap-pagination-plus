import { Extension } from "@tiptap/core";
interface PaginationPlusOptions {
    pageHeight: number;
    pageGap: number;
    pageBreakBackground: string;
    pageHeaderHeight: number;
    pageFooterHeight: number;
    pageGapBorderSize: number;
    footerText: string;
}
export declare const PaginationPlus: Extension<PaginationPlusOptions, any>;
export {};
