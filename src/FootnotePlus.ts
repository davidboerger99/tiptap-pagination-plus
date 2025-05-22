import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { DecorationSet } from "@tiptap/pm/view"

export interface FootnotePlusOptions {
  HTMLAttributes: Record<string, any>
}

interface FootnoteData {
  text: string
  pos: number
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      /**
       * Add a footnote
       */
      setFootnote: (text: string) => ReturnType
    }
  }
}

// Add global timer variables with correct type
declare global {
  interface Window {
    footnoteUpdateTimer: ReturnType<typeof setTimeout>
    footnoteResizeTimer: ReturnType<typeof setTimeout>
    footnoteScrollTimer: ReturnType<typeof setTimeout>
    debugMode: boolean
  }
}

// Initialize debug mode
if (typeof window !== "undefined") {
  window.debugMode = true
}

export const FootnotePlus = Node.create<FootnotePlusOptions>({
  name: "footnote",

  group: "inline",

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text"),
        renderHTML: (attributes) => {
          return {
            "data-text": attributes.text,
          }
        },
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => {
          return {
            "data-id": attributes.id,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-footnote]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-footnote": "" }),
      `${HTMLAttributes.id || ""}`,
    ]
  },

  addCommands() {
    return {
      setFootnote:
        (text: string) =>
        ({ chain }) => {
          // Generate a unique ID for this footnote
          const id = `footnote-${Date.now()}-${Math.floor(Math.random() * 1000)}`

          return chain()
            .insertContent({
              type: this.name,
              attrs: { text, id },
            })
            .run()
        },
    }
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      const id = node.attrs.id || ""

      // Store the footnote ID as a data attribute for easier reference
      dom.setAttribute("data-footnote", "")
      dom.setAttribute("data-id", id)
      dom.setAttribute("data-text", node.attrs.text || "")
      dom.classList.add("footnote-reference")

      // We'll set the actual number in the plugin's update method
      dom.textContent = "[?]"
      dom.style.verticalAlign = "super"
      dom.style.fontSize = "0.75em"
      dom.style.color = "#0066cc"
      dom.style.cursor = "pointer"
      dom.style.userSelect = "none"

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "footnote") {
            return false
          }
          return true
        },
      }
    }
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey("footnotePlugin")

    const footnotePlugin = new Plugin({
      key: pluginKey,

      state: {
        init() {
          return {
            footnotes: {} as Record<string, FootnoteData>,
            decorations: DecorationSet.empty,
          }
        },

        apply(tr, state) {
          const { doc } = tr
          const footnotes: Record<string, FootnoteData> = {}

          // Collect all footnotes from the document with their positions
          doc.descendants((node, pos) => {
            if (node.type.name === "footnote") {
              const id = node.attrs.id
              const text = node.attrs.text

              if (id && text) {
                footnotes[id] = { text, pos }
              }
            }
          })

          return {
            footnotes,
            decorations: state.decorations,
          }
        },
      },

      view(view) {
        // Debug function to log information
        const debug = (message: string, ...args: any[]) => {
          if (window.debugMode) {
            console.log(`[FootnotePlus] ${message}`, ...args)
          }
        }

        // ULTRA SIMPLE APPROACH: Just show all footnotes on all pages
        const updateFootnotes = () => {
          debug("Starting footnote update with ultra simple approach")
          const state = pluginKey.getState(view.state)
          if (!state) {
            debug("No state found")
            return
          }

          debug("Footnotes in state:", state.footnotes)

          // Get all footnote references in the document
          const footnoteRefs = document.querySelectorAll(".footnote-reference")
          debug(`Found ${footnoteRefs.length} footnote references`)

          if (footnoteRefs.length === 0) {
            debug("No footnote references found")
            return
          }

          // Create a global index for consistent numbering
          let globalFootnoteIndex = 1
          const footnoteIndices: Record<string, number> = {}

          // First pass: assign global indices to all footnotes
          const sortedFootnotes = Object.entries(state.footnotes)
            .sort((a, b) => {
              const aData = a[1] as FootnoteData
              const bData = b[1] as FootnoteData
              return aData.pos - bData.pos
            })
            .map(([id, data]) => {
              const typedData = data as FootnoteData
              return { id, text: typedData.text, pos: typedData.pos }
            })

          debug("Sorted footnotes:", sortedFootnotes)

          sortedFootnotes.forEach((footnote) => {
            footnoteIndices[footnote.id] = globalFootnoteIndex++
          })

          // Update footnote reference numbers
          footnoteRefs.forEach((ref) => {
            const id = ref.getAttribute("data-id")
            if (!id || !footnoteIndices[id]) return

            ref.textContent = `[${footnoteIndices[id]}]`
          })

          // Get all footers
          const footers = document.querySelectorAll(".rm-page-footer")
          debug(`Found ${footers.length} footers`)

          if (footers.length === 0) {
            debug("No footers found, exiting")
            return
          }

          // Add footnotes to ALL pages
          footers.forEach((footer, pageIndex) => {
            debug(`Processing footer for page ${pageIndex}`)

            // Find or create the footnote container
            let container = footer.querySelector(".footnote-container") as HTMLElement
            if (!container) {
              debug(`Creating footnote container for page ${pageIndex}`)
              container = document.createElement("div")
              container.classList.add("footnote-container")
              container.style.position = "absolute"
              container.style.bottom = "5px"
              container.style.left = "25px"
              container.style.right = "25px"
              container.style.borderTop = "1px solid #ddd"
              container.style.paddingTop = "5px"
              container.style.fontSize = "0.85em"
              container.style.backgroundColor = "#fff" // Ensure it's visible
              footer.appendChild(container)

              debug(`Container created and appended to footer: ${container !== null}`)
            }

            // Clear existing footnotes
            container.innerHTML = ""

            // Make sure the container is visible
            container.style.display = "block"

            // Add all footnotes to the container
            sortedFootnotes.forEach((footnote) => {
              const footnoteElement = document.createElement("div")
              footnoteElement.classList.add("footnote-item")
              footnoteElement.setAttribute("data-footnote-id", footnote.id)
              footnoteElement.innerHTML = `<sup>${footnoteIndices[footnote.id]}</sup> ${footnote.text}`
              footnoteElement.style.marginBottom = "3px"
              container.appendChild(footnoteElement)

              debug(`Added footnote ${footnoteIndices[footnote.id]} to page ${pageIndex}`)
            })

            // Force the container to be visible
            setTimeout(() => {
              container.style.display = "block"
              debug(`Forced container visibility for page ${pageIndex}`)
            }, 100)
          })

          // Add a visual indicator that the update ran
          const timestamp = new Date().toISOString()
          debug(`Footnote update completed at ${timestamp}`)

          // Force a reflow
          document.body.offsetHeight
        }

        // Initial update with a delay to ensure layout is complete
        setTimeout(() => {
          debug("Initial footnote update")
          updateFootnotes()
        }, 1000)

        // Set up a mutation observer to detect DOM changes
        const observer = new MutationObserver(() => {
          // Use a debounce mechanism to avoid too frequent updates
          if (window.footnoteUpdateTimer) {
            clearTimeout(window.footnoteUpdateTimer)
          }
          window.footnoteUpdateTimer = setTimeout(() => {
            debug("DOM mutation triggered update")
            updateFootnotes()
          }, 500)
        })

        // Start observing the editor
        observer.observe(view.dom, {
          childList: true,
          subtree: true,
          characterData: true,
        })

        // Set up an interval to periodically check for changes
        const intervalId = setInterval(() => {
          debug("Interval triggered update")
          updateFootnotes()
        }, 3000)

        // Listen for pagination updates
        const paginationUpdateHandler = () => {
          debug("Pagination update event received")
          if (window.footnoteUpdateTimer) {
            clearTimeout(window.footnoteUpdateTimer)
          }
          window.footnoteUpdateTimer = setTimeout(updateFootnotes, 1000)
        }

        document.addEventListener("paginationUpdated", paginationUpdateHandler)

        // Add click handler for footnote references
        view.dom.addEventListener("click", (event) => {
          const target = event.target as HTMLElement
          if (target.classList.contains("footnote-reference")) {
            const id = target.getAttribute("data-id")
            if (!id) return

            // Find the corresponding footnote item
            const footnoteItem = document.querySelector(`.footnote-item[data-footnote-id="${id}"]`)
            if (footnoteItem) {
              footnoteItem.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          }
        })

        // Add a global debug button
        if (window.debugMode) {
          const existingButton = document.querySelector("#footnote-debug-button")
          if (!existingButton) {
            const debugButton = document.createElement("button")
            debugButton.id = "footnote-debug-button"
            debugButton.textContent = "Update Footnotes"
            debugButton.style.position = "fixed"
            debugButton.style.top = "10px"
            debugButton.style.right = "10px"
            debugButton.style.zIndex = "9999"
            debugButton.addEventListener("click", updateFootnotes)
            document.body.appendChild(debugButton)
          }
        }

        return {
          update: () => {
            // Schedule an update
            if (window.footnoteUpdateTimer) {
              clearTimeout(window.footnoteUpdateTimer)
            }
            window.footnoteUpdateTimer = setTimeout(() => {
              debug("View update triggered footnote update")
              updateFootnotes()
            }, 500)
            return true
          },
          destroy: () => {
            // Clean up
            observer.disconnect()
            clearInterval(intervalId)
            document.removeEventListener("paginationUpdated", paginationUpdateHandler)
            if (window.footnoteUpdateTimer) clearTimeout(window.footnoteUpdateTimer)
            if (window.footnoteResizeTimer) clearTimeout(window.footnoteResizeTimer)
            if (window.footnoteScrollTimer) clearTimeout(window.footnoteScrollTimer)

            // Remove debug elements
            const debugButton = document.querySelector("#footnote-debug-button")
            if (debugButton) debugButton.remove()
          },
        }
      },
    })

    return [footnotePlugin]
  },
})

export default FootnotePlus
