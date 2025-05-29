// Enhanced PaginationPlus with responsive support
import { Extension } from "@tiptap/core"
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Editor } from "@tiptap/core"

interface PaginationPlusOptions {
  pageHeight: number
  pageGap: number
  pageBreakBackground: string
  pageHeaderHeight: number
  pageFooterHeight: number
  pageMarginLeft: number
  pageMarginRight: number
  pageGapBorderSize: number
  footerText: string | string[] | ((pageNumber: number) => string)
}

interface MarginUpdate {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

const pagination_meta_key = "PAGINATION_META_KEY"
const resize_meta_key = "RESIZE_META_KEY"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paginationPlus: {
      updatePageMargins: (margins: MarginUpdate) => ReturnType
      refreshPagination: () => ReturnType
    }
  }
}

// Helper functions outside the extension
function updateStyles(extension: any) {
  const styleElement = extension.storage.styleElement as HTMLStyleElement
  if (!styleElement) return

  const _pageHeaderHeight = extension.options.pageHeaderHeight
  const _pageFooterHeight = extension.options.pageFooterHeight
  const _pageMarginLeft = extension.options.pageMarginLeft
  const _pageMarginRight = extension.options.pageMarginRight
  const _pageHeight = extension.options.pageHeight - (_pageHeaderHeight + _pageFooterHeight)

  styleElement.textContent = `
    .ProseMirror {
      padding-right: ${_pageMarginRight}px;
      padding-left: ${_pageMarginLeft}px;
    }
    .rm-with-pagination {
      counter-reset: page-number;
    }
    .rm-with-pagination .rm-page-footer {
      height: ${_pageFooterHeight}px;
      position: relative;
    }
    .rm-with-pagination .rm-page-header {
      height: ${_pageHeaderHeight}px;
      position: relative;
    }
    .rm-with-pagination .rm-page-footer::before {
      counter-increment: page-number;
      content: counter(page-number); 
      position: absolute;
      top: 5px;
      right: ${_pageMarginRight}px;
    }
    .rm-with-pagination .rm-page-footer::after {
      content: attr(data-footer-text); 
      position: absolute;
      top: 5px;
      left: ${_pageMarginLeft}px;
    }
    .rm-with-pagination .rm-page-break .breaker {
      width: calc(100% + ${_pageMarginLeft + _pageMarginRight}px) !important;
      margin-left: -${_pageMarginLeft}px !important;
      margin-right: -${_pageMarginRight}px !important;
      box-sizing: border-box;
    }
    .rm-with-pagination .rm-pagination-gap {
      width: calc(100% + 2px + ${_pageMarginLeft + _pageMarginRight}px) !important;
      left: calc(-1px - ${_pageMarginLeft}px);
      position: relative;
      box-sizing: border-box;
    }
    .rm-with-pagination table {
      width: 100%;
      table-layout: fixed;
    }
    .rm-with-pagination table tbody > tr > td {
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .rm-with-pagination .table-row-group {
      max-height: ${_pageHeight}px;
      overflow-y: auto;
      width: 100%;
    }

    .rm-with-pagination .rm-page-break.last-page ~ .rm-page-break {
          display: none;
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .ProseMirror {
        padding-right: ${Math.min(_pageMarginRight, 10)}px;
        padding-left: ${Math.min(_pageMarginLeft, 10)}px;
      }
      .rm-with-pagination .rm-page-break .breaker {
        width: calc(100% + ${Math.min(_pageMarginLeft, 10) + Math.min(_pageMarginRight, 10)}px) !important;
        margin-left: -${Math.min(_pageMarginLeft, 10)}px !important;
        margin-right: -${Math.min(_pageMarginRight, 10)}px !important;
      }
      .rm-with-pagination .rm-pagination-gap {
        width: calc(100% + 2px + ${Math.min(_pageMarginLeft, 10) + Math.min(_pageMarginRight, 10)}px) !important;
        left: calc(-1px - ${Math.min(_pageMarginLeft, 10)}px);
      }
    }
  `
}

function setupObservers(extension: any) {
  const targetNode = extension.editor.view.dom

  // Existing mutation observer
  const mutationCallback = (mutationList: MutationRecord[]) => {
    if (mutationList.length > 0 && mutationList[0].target) {
      const _target = mutationList[0].target as HTMLElement
      if (_target.classList.contains("rm-with-pagination")) {
        refreshPage(extension, _target)
      }
    }
  }

  const mutationObserver = new MutationObserver(mutationCallback)
  mutationObserver.observe(targetNode, { attributes: true, childList: true, subtree: true })

  // New resize observer
  if (typeof ResizeObserver !== "undefined") {
    const resizeCallback = (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width

        // Only trigger update if width actually changed significantly
        if (Math.abs(newWidth - extension.storage.currentWidth) > 5) {
          extension.storage.currentWidth = newWidth

          // Debounce the update
          clearTimeout(extension.storage.resizeTimeout)
          extension.storage.resizeTimeout = setTimeout(() => {
            extension.editor.view.dispatch(extension.editor.view.state.tr.setMeta(resize_meta_key, true))
          }, 150)
        }
      }
    }

    extension.storage.resizeObserver = new ResizeObserver(resizeCallback)
    extension.storage.resizeObserver.observe(targetNode)
  }
}

function refreshPage(extension: any, targetNode: HTMLElement) {
  const target = Array.from(targetNode.children).find(
    (child): child is HTMLElement => child.id === "pages"
  )
  if (!target) return

  const pageElements = [...target.querySelectorAll(".page")] as HTMLElement[]
  const contentElements = [...targetNode.children] as HTMLElement[]

  const pageTops = pageElements.map((el) => el.offsetTop).filter((top) => top !== 0)
  pageTops.push(Number.POSITIVE_INFINITY)

  const pagesWithContent = new Set()

  for (let i = 2; i < contentElements.length - 1; i++) {
    const top = contentElements[i].offsetTop
    for (let j = 0; j < pageTops.length - 1; j++) {
      if (top >= pageTops[j] && top < pageTops[j + 1]) {
        pagesWithContent.add(j + 1)
        break
      }
    }
  }

  const maxPage = pagesWithContent.size > 0 ? Math.max(...Array.from(pagesWithContent as Set<number>)) : 0
  const _maxPage = maxPage + 2

  targetNode.style.minHeight = `${
    _maxPage * extension.options.pageHeight +
    (_maxPage - 1) * (extension.options.pageGap + 2 * extension.options.pageGapBorderSize)
  }px`

  if (maxPage + 1 < target.children.length) {
    const lastPage = target.children[maxPage + 1] as HTMLElement
    lastPage.classList.add("last-page")
    // lastPage.style.display = "none"
  }

  // Update breaker widths for all page breaks with margins
  const breakers = target.querySelectorAll(".breaker") as NodeListOf<HTMLElement>
  const _pageMarginLeft = extension.options.pageMarginLeft
  const _pageMarginRight = extension.options.pageMarginRight

  breakers.forEach((breaker) => {
    breaker.style.width = `calc(100% + ${_pageMarginLeft + _pageMarginRight}px)`
    breaker.style.marginLeft = `-${_pageMarginLeft}px`
    breaker.style.marginRight = `-${_pageMarginRight}px`
  })
}

function createPageBreak({
  firstPage,
  pageIndex,
  pageOptions,
}: {
  firstPage: boolean
  pageIndex: number
  pageOptions: PaginationPlusOptions
}) {
  const _pageHeaderHeight = pageOptions.pageHeaderHeight
  const _pageFooterHeight = pageOptions.pageFooterHeight
  const _pageMarginLeft = pageOptions.pageMarginLeft
  const _pageMarginRight = pageOptions.pageMarginRight
  const _pageHeight = pageOptions.pageHeight - (_pageHeaderHeight + _pageFooterHeight)
  const _pageGap = pageOptions.pageGap
  const _pageBreakBackground = pageOptions.pageBreakBackground

  const pageContainer = document.createElement("div")
  pageContainer.classList.add("rm-page-break")

  const page = document.createElement("div")
  page.classList.add("page")
  page.style.position = "relative"
  page.style.float = "left"
  page.style.clear = "both"
  page.style.marginTop = firstPage ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)` : _pageHeight + "px"

  const pageBreak = document.createElement("div")
  pageBreak.classList.add("breaker")
  pageBreak.style.width = `calc(100% + ${_pageMarginLeft + _pageMarginRight}px)`
  pageBreak.style.position = "relative"
  pageBreak.style.float = "left"
  pageBreak.style.clear = "both"
  pageBreak.style.left = "0px"
  pageBreak.style.right = "0px"
  pageBreak.style.marginLeft = `-${_pageMarginLeft}px`
  pageBreak.style.marginRight = `-${_pageMarginRight}px`
  pageBreak.style.zIndex = "2"
  pageBreak.style.boxSizing = "border-box"

  const pageFooter = document.createElement("div")
  pageFooter.classList.add("rm-page-footer")
  pageFooter.style.height = _pageFooterHeight + "px"

  // Footer text logic
  let footerText = ""
  if (typeof pageOptions.footerText === "string") {
    footerText = pageOptions.footerText
  } else if (Array.isArray(pageOptions.footerText)) {
    footerText = pageOptions.footerText[pageIndex] || pageOptions.footerText[pageOptions.footerText.length - 1] || ""
  } else if (typeof pageOptions.footerText === "function") {
    footerText = pageOptions.footerText(pageIndex + 1)
  }

  pageFooter.setAttribute("data-footer-text", footerText)

  const pageSpace = document.createElement("div")
  pageSpace.classList.add("rm-pagination-gap")
  pageSpace.style.height = _pageGap + "px"
  pageSpace.style.borderLeft = "1px solid"
  pageSpace.style.borderRight = "1px solid"
  pageSpace.style.position = "relative"
  pageSpace.style.width = `calc(100% + 2px + ${_pageMarginLeft + _pageMarginRight}px)`
  pageSpace.style.left = `calc(-1px - ${_pageMarginLeft}px)`
  pageSpace.style.backgroundColor = _pageBreakBackground
  pageSpace.style.borderLeftColor = _pageBreakBackground
  pageSpace.style.borderRightColor = _pageBreakBackground
  pageSpace.style.boxSizing = "border-box"

  const pageHeader = document.createElement("div")
  pageHeader.classList.add("rm-page-header")
  pageHeader.style.height = _pageHeaderHeight + "px"

  pageBreak.append(pageFooter, pageSpace, pageHeader)
  pageContainer.append(page, pageBreak)

  return pageContainer
}

function createDecoration(state: EditorState, pageOptions: PaginationPlusOptions): Decoration[] {
  const pageWidget = Decoration.widget(
    0,
    (view) => {
      const _extraPages = 5;
      const _pageGap = pageOptions.pageGap
      const _pageHeaderHeight = pageOptions.pageHeaderHeight
      const _pageFooterHeight = pageOptions.pageFooterHeight
      const _pageHeight = pageOptions.pageHeight - (_pageHeaderHeight + _pageFooterHeight)

      const el = document.createElement("div")
      el.dataset.rmPagination = "true"
      el.id = "pages"

      // Calculate pages based on content
      const childElements = view.dom.children
      let totalHeight = 0

      for (let i = 2; i < childElements.length - 1; i++) {
        totalHeight += childElements[i].scrollHeight
      }

      const paginationElement = document.querySelector("[data-rm-pagination]")
      let previousPageCount = paginationElement ? paginationElement.children.length : 0
      previousPageCount = previousPageCount > _extraPages ? previousPageCount - _extraPages : 0

      const totalPageGap = _pageGap + _pageHeaderHeight + _pageFooterHeight
      const actualPageContentHeight =
        totalHeight - previousPageCount * (totalPageGap + pageOptions.pageGapBorderSize * 2)
      let pages = Math.ceil(actualPageContentHeight / _pageHeight)
      pages = pages > 0 ? pages - 1 : 0

      // Create page breaks with responsive width
      const fragment = document.createDocumentFragment()

      for (let i = 0; i < pages + _extraPages; i++) {
        const pageContainer = createPageBreak({
          firstPage: i === 0,
          pageIndex: i,
          pageOptions,
        })
        fragment.appendChild(pageContainer)
      }

      el.appendChild(fragment)
      return el
    },
    { side: -1 },
  )

  const firstHeaderWidget = Decoration.widget(
    0,
    () => {
      const el = document.createElement("div")
      el.style.height = `${pageOptions.pageHeaderHeight}px`
      return el
    },
    { side: -1 },
  )

  const lastFooterWidget = Decoration.widget(
    state.doc.content.size,
    () => {
      const el = document.createElement("div")
      el.style.height = `${pageOptions.pageFooterHeight}px`
      return el
    },
    { side: 1 },
  )

  return [pageWidget, firstHeaderWidget, lastFooterWidget]
}

export const PaginationPlus = Extension.create<PaginationPlusOptions>({
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
    }
  },

  addCommands() {
    return {
      updatePageMargins:
        (margins: MarginUpdate) =>
        ({ editor }: { editor: Editor }) => {
          // Existing validation logic...
          const { left, right, top, bottom } = margins

          if (left !== undefined && (typeof left !== "number" || left < 0)) {
            console.error("Left margin must be a non-negative number")
            return false
          }

          if (right !== undefined && (typeof right !== "number" || right < 0)) {
            console.error("Right margin must be a non-negative number")
            return false
          }

          if (top !== undefined && (typeof top !== "number" || top < 0)) {
            console.error("Top margin (header height) must be a non-negative number")
            return false
          }

          if (bottom !== undefined && (typeof bottom !== "number" || bottom < 0)) {
            console.error("Bottom margin (footer height) must be a non-negative number")
            return false
          }

          // Update options
          if (left !== undefined) this.options.pageMarginLeft = left
          if (right !== undefined) this.options.pageMarginRight = right
          if (top !== undefined) this.options.pageHeaderHeight = top
          if (bottom !== undefined) this.options.pageFooterHeight = bottom

          updateStyles(this)
          editor.view.dispatch(editor.view.state.tr.setMeta(pagination_meta_key, true))
          return true
        },

      refreshPagination:
        () =>
        ({ editor }: { editor: Editor }) => {
          editor.view.dispatch(editor.view.state.tr.setMeta(resize_meta_key, true))
          return true
        },
    }
  },

  addStorage() {
    return {
      styleElement: null as HTMLStyleElement | null,
      resizeObserver: null as ResizeObserver | null,
      resizeTimeout: null as NodeJS.Timeout | null,
      currentWidth: 0,
    }
  },

  onCreate() {
    const targetNode = this.editor.view.dom
    targetNode.classList.add("rm-with-pagination")

    // Store initial width
    this.storage.currentWidth = targetNode.clientWidth

    // Create style element
    const style = document.createElement("style")
    style.dataset.rmPaginationStyle = ""
    this.storage.styleElement = style
    document.head.appendChild(style)

    updateStyles(this)
    setupObservers(this)
    refreshPage(this, targetNode)
  },

  onDestroy() {
    // Clean up observers and styles
    if (this.storage.resizeObserver) {
      this.storage.resizeObserver.disconnect()
    }

    if (this.storage.resizeTimeout) {
      clearTimeout(this.storage.resizeTimeout)
    }

    if (this.storage.styleElement?.parentNode) {
      this.storage.styleElement.parentNode.removeChild(this.storage.styleElement)
    }
  },

  addProseMirrorPlugins() {
    const pageOptions = this.options
    return [
      new Plugin({
        key: new PluginKey("pagination"),

        state: {
          init(_, state) {
            const widgetList = createDecoration(state, pageOptions)
            return DecorationSet.create(state.doc, widgetList)
          },
          apply(tr, oldDeco, oldState, newState) {
            if (tr.docChanged || tr.getMeta(pagination_meta_key) || tr.getMeta(resize_meta_key)) {
              const widgetList = createDecoration(newState, pageOptions)
              return DecorationSet.create(newState.doc, [...widgetList])
            }
            return oldDeco
          },
        },

        props: {
          decorations(state: EditorState) {
            return this.getState(state) as DecorationSet
          },
        },
      }),
    ]
  },
})