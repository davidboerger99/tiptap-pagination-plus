// DecorativeDecoration.ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
const pagination_meta_key = "PAGINATION_META_KEY";
export const PaginationPlus = Extension.create({
    name: "PaginationPlus",
    addOptions() {
        return {
            pageHeight: 800,
            pageGap: 50,
            pageGapBorderSize: 1,
            pageBreakBackground: "#ffffff",
            pageHeaderHeight: 10,
            pageFooterHeight: 10,
            pageMarginLeft: 0,
            pageMarginRight: 0,
            footerText: "",
        };
    },
    onCreate() {
        const targetNode = this.editor.view.dom;
        targetNode.classList.add("rm-with-pagination");
        const config = { attributes: true };
        const _pageHeaderHeight = this.options.pageHeaderHeight;
        const _pageFooterHeight = this.options.pageFooterHeight;
        const _pageMarginLeft = this.options.pageMarginLeft;
        const _pageMarginRight = this.options.pageMarginRight;
        const _pageHeight = this.options.pageHeight - (_pageHeaderHeight + _pageFooterHeight);
        const style = document.createElement("style");
        style.dataset.rmPaginationStyle = "";
        style.textContent = `
      .ProseMirror {
        padding-right: ${_pageMarginRight}px;
      }
      .rm-with-pagination {
        counter-reset: page-number;
      }
      .rm-with-pagination .rm-page-footer::before {
        counter-increment: page-number;
      }
      .rm-with-pagination .rm-page-footer::before {
        content: counter(page-number); 
        position: absolute;
        right: 25px;
        top: 5px;
      }
      .rm-with-pagination .rm-page-footer::after {
        content: attr(data-footer-text); 
        position: absolute;
        left: 25px;
        top: 5px;
      }
      .rm-with-pagination .rm-page-break.last-page ~ .rm-page-break {
        display: none;
      }
      .rm-with-pagination .rm-page-break.last-page .rm-pagination-gap {
        display: none;
      }
      .rm-with-pagination .rm-page-break.last-page .rm-page-header {
        display: none;
      }
      .rm-with-pagination table tbody > tr > td {
        width: calc(100% / var(--cell-count));
        word-break: break-all;
      }
      .rm-with-pagination table > tr {
        display: grid;
        min-width: 100%;
      }
      .rm-with-pagination table {
        border-collapse: collapse;
        width: 100%;
        display: contents;
      }
      .rm-with-pagination table tbody{
        display: table;
        max-height: 300px;
        overflow-y: auto;
      }
      .rm-with-pagination table tbody > tr{
        display: table-row !important;
      }
      .rm-with-pagination p:has(br.ProseMirror-trailingBreak:only-child) {
        @apply table w-full;
      }
      .rm-with-pagination .table-row-group {
        max-height: ${_pageHeight}px;
        overflow-y: auto;
        width: 100%;
      }
    `;
        document.head.appendChild(style);
        const _pageGap = this.options.pageGap;
        const _pageGapBorderSize = this.options.pageGapBorderSize;
        const refreshPage = (targetNode) => {
            const target = Array.from(targetNode.children).find((child) => child.id === "pages");
            if (!target)
                return;
            const pageElements = [...target.querySelectorAll(".page")];
            const contentElements = [...targetNode.children];
            const pageTops = pageElements.map((el) => el.offsetTop).filter((top) => top !== 0);
            pageTops.push(Number.POSITIVE_INFINITY); // to simplify range check for last page
            const pagesWithContent = new Set();
            for (let i = 2; i < contentElements.length - 1; i++) {
                const top = contentElements[i].offsetTop;
                for (let i = 0; i < pageTops.length - 1; i++) {
                    if (top >= pageTops[i] && top < pageTops[i + 1]) {
                        pagesWithContent.add(i + 1); // page index starting from 1
                        break;
                    }
                }
            }
            const maxPage = pagesWithContent.size > 0 ? Math.max(...Array.from(pagesWithContent)) : 0;
            const _maxPage = maxPage + 2;
            targetNode.style.minHeight = `${_maxPage * this.options.pageHeight + (_maxPage - 1) * (_pageGap + 2 * _pageGapBorderSize)}px`;
            if (maxPage + 1 in target.children) {
                target.children[maxPage + 1].classList.add("last-page");
            }
        };
        const callback = (mutationList, observer) => {
            if (mutationList.length > 0 && mutationList[0].target) {
                const _target = mutationList[0].target;
                if (_target.classList.contains("rm-with-pagination")) {
                    refreshPage(_target);
                }
            }
        };
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        refreshPage(targetNode);
        this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
    },
    addProseMirrorPlugins() {
        const pageOptions = this.options;
        return [
            new Plugin({
                key: new PluginKey("pagination"),
                state: {
                    init(_, state) {
                        const widgetList = createDecoration(state, pageOptions);
                        return DecorationSet.create(state.doc, widgetList);
                    },
                    apply(tr, oldDeco, oldState, newState) {
                        // Recalculate only on doc changes
                        if (tr.docChanged || tr.getMeta(pagination_meta_key)) {
                            const widgetList = createDecoration(newState, pageOptions);
                            return DecorationSet.create(newState.doc, [...widgetList]);
                        }
                        return oldDeco;
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
function createDecoration(state, pageOptions) {
    const pageWidget = Decoration.widget(0, (view) => {
        const _extraPages = 5;
        const _pageGap = pageOptions.pageGap;
        const _pageHeaderHeight = pageOptions.pageHeaderHeight;
        const _pageFooterHeight = pageOptions.pageFooterHeight;
        const _pageHeight = pageOptions.pageHeight - (_pageHeaderHeight + _pageFooterHeight);
        const _pageBreakBackground = pageOptions.pageBreakBackground;
        const _pageGapBorderSize = pageOptions.pageGapBorderSize;
        const _pageMarginRight = pageOptions.pageMarginRight;
        const childElements = view.dom.children;
        let totalHeight = 0;
        for (let i = 2; i < childElements.length - 1; i++) {
            totalHeight += childElements[i].scrollHeight;
        }
        const paginationElement = document.querySelector("[data-rm-pagination]");
        let previousPageCount = paginationElement ? paginationElement.children.length : 0;
        previousPageCount = previousPageCount > _extraPages ? previousPageCount - _extraPages : 0;
        const totalPageGap = _pageGap + _pageHeaderHeight + _pageFooterHeight;
        const actualPageContentHeight = totalHeight - previousPageCount * (totalPageGap + _pageGapBorderSize * 2);
        let pages = Math.ceil(actualPageContentHeight / _pageHeight);
        pages = pages > 0 ? pages - 1 : 0;
        const breakerWidth = view.dom.clientWidth;
        const el = document.createElement("div");
        el.dataset.rmPagination = "true";
        const pageBreakDefinition = ({ firstPage = false, lastPage = false, pageIndex = 0, }) => {
            const pageContainer = document.createElement("div");
            pageContainer.classList.add("rm-page-break");
            const page = document.createElement("div");
            page.classList.add("page");
            page.style.position = "relative";
            page.style.float = "left";
            page.style.clear = "both";
            page.style.paddingLeft = `${pageOptions.pageMarginLeft}px`;
            page.style.marginTop = firstPage ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)` : _pageHeight + "px";
            const pageBreak = document.createElement("div");
            pageBreak.classList.add("breaker");
            pageBreak.style.width = `calc(${breakerWidth}px)`;
            pageBreak.style.marginLeft = `calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%))`;
            pageBreak.style.marginRight = `calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%))`;
            pageBreak.style.position = "relative";
            pageBreak.style.float = "left";
            pageBreak.style.clear = "both";
            pageBreak.style.left = "0px";
            pageBreak.style.right = "0px";
            pageBreak.style.zIndex = "2";
            const pageFooter = document.createElement("div");
            pageFooter.classList.add("rm-page-footer");
            pageFooter.style.height = _pageFooterHeight + "px";
            // Set the footer text based on the type of footerText option
            let footerText = "";
            if (typeof pageOptions.footerText === "string") {
                footerText = pageOptions.footerText;
            }
            else if (Array.isArray(pageOptions.footerText) && pageOptions.footerText.length > 0) {
                const pageNum = pageIndex + 1;
                footerText =
                    pageOptions.footerText[pageIndex] || pageOptions.footerText[pageOptions.footerText.length - 1] || "";
            }
            else if (typeof pageOptions.footerText === "function") {
                footerText = pageOptions.footerText(pageIndex + 1);
            }
            pageFooter.setAttribute("data-footer-text", footerText);
            const pageSpace = document.createElement("div");
            pageSpace.classList.add("rm-pagination-gap");
            pageSpace.style.height = _pageGap + "px";
            pageSpace.style.borderLeft = "1px solid";
            pageSpace.style.borderRight = "1px solid";
            pageSpace.style.marginLeft = `${_pageMarginRight / 2}px`;
            pageSpace.style.position = "relative";
            pageSpace.style.setProperty("width", "calc(100% + 2px)", "important");
            pageSpace.style.left = "-1px";
            pageSpace.style.backgroundColor = _pageBreakBackground;
            pageSpace.style.borderLeftColor = _pageBreakBackground;
            pageSpace.style.borderRightColor = _pageBreakBackground;
            const pageHeader = document.createElement("div");
            pageHeader.classList.add("rm-page-header");
            pageHeader.style.height = _pageHeaderHeight + "px";
            pageBreak.append(pageFooter, pageSpace, pageHeader);
            pageContainer.append(page, pageBreak);
            return pageContainer;
        };
        const page = pageBreakDefinition({ firstPage: false, lastPage: false, pageIndex: 0 });
        const firstPage = pageBreakDefinition({
            firstPage: true,
            lastPage: false,
            pageIndex: 0,
        });
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < pages + _extraPages; i++) {
            if (i === 0) {
                fragment.appendChild(pageBreakDefinition({
                    firstPage: true,
                    lastPage: false,
                    pageIndex: i,
                }).cloneNode(true));
            }
            else {
                fragment.appendChild(pageBreakDefinition({
                    firstPage: false,
                    lastPage: false,
                    pageIndex: i,
                }).cloneNode(true));
            }
        }
        el.append(fragment);
        el.id = "pages";
        return el;
    }, { side: -1 });
    const firstHeaderWidget = Decoration.widget(0, () => {
        const el = document.createElement("div");
        el.style.height = `${pageOptions.pageHeaderHeight}px`;
        return el;
    }, { side: -1 });
    const lastFooterWidget = Decoration.widget(state.doc.content.size, () => {
        const el = document.createElement("div");
        el.style.height = `${pageOptions.pageFooterHeight}px`;
        return el;
    }, { side: 1 });
    return [pageWidget, firstHeaderWidget, lastFooterWidget];
}
