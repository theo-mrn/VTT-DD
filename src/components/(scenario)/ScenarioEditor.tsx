"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Typography from "@tiptap/extension-typography"
import Mention from "@tiptap/extension-mention"
import { EditorToolbar } from "./EditorToolbar"
import getSuggestionConfig from "./suggestion"
import getSceneSuggestionConfig from "./sceneSuggestion"

interface ScenarioEditorProps {
    initialContent?: string
    roomId: string
    scenes?: { id: string, title: string }[]
    onNavigateToScene?: (sceneId: string) => void
    onChange?: (content: string) => void
}

export function ScenarioEditor({ initialContent = "", roomId, scenes = [], onNavigateToScene, onChange }: ScenarioEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Placeholder.configure({
                placeholder: "Commencez à écrire votre scénario ici (tapez @ pour un personnage ou # pour une scène)...",
                emptyEditorClass: "is-editor-empty",
            }),
            Typography,
            Mention.configure({
                HTMLAttributes: {
                    class: "mention bg-primary/20 text-primary font-medium px-1 py-0.5 rounded-sm cursor-pointer hover:bg-primary/30",
                },
                renderLabel({ options, node }) {
                    return `${node.attrs.label ?? node.attrs.id}`
                },
                suggestion: getSuggestionConfig(roomId),
            }),
            Mention.extend({
                name: 'sceneMention',
            }).configure({
                HTMLAttributes: {
                    class: "scene-mention bg-amber-600/20 text-amber-700 dark:text-amber-400 font-medium px-1 py-0.5 rounded-sm cursor-pointer hover:bg-amber-600/30",
                },
                renderLabel({ options, node }) {
                    return `${node.attrs.label ?? node.attrs.id}`
                },
                suggestion: getSceneSuggestionConfig(scenes),
            }),
        ],
        content: initialContent,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class:
                    "prose prose-sm dark:prose-invert sm:prose-base lg:prose-lg xl:prose-xl focus:outline-none max-w-none min-h-[calc(100vh-16rem)] px-8 py-6",
            },
            handleClick: (view, pos, event) => {
                const target = event.target as HTMLElement
                if (target && target.classList.contains("scene-mention")) {
                    const sceneId = target.getAttribute("data-id")
                    if (sceneId && onNavigateToScene) {
                        onNavigateToScene(sceneId)
                        return true
                    }
                }
                return false
            }
        },
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML())
        },
    })

    return (
        <div className="relative w-full border border-border/50 rounded-md bg-white/80 dark:bg-black/60 backdrop-blur-sm shadow-sm flex flex-col">
            <EditorToolbar editor={editor} scenes={scenes} />
            <div className="flex-1">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}
