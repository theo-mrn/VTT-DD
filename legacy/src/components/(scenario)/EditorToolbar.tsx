"use client"

import { type Editor } from "@tiptap/react"
import {
    Bold,
    Italic,
    Strikethrough,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Undo,
    Redo,
    Link as LinkIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface EditorToolbarProps {
    editor: Editor | null
    scenes?: { id: string, title: string }[]
}

export function EditorToolbar({ editor, scenes = [] }: EditorToolbarProps) {
    if (!editor) {
        return null
    }

    const toggleBold = () => editor.chain().focus().toggleBold().run()
    const toggleItalic = () => editor.chain().focus().toggleItalic().run()
    const toggleStrike = () => editor.chain().focus().toggleStrike().run()
    const toggleHeading = (level: 1 | 2 | 3) => editor.chain().focus().toggleHeading({ level }).run()
    const toggleBulletList = () => editor.chain().focus().toggleBulletList().run()
    const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run()
    const toggleBlockquote = () => editor.chain().focus().toggleBlockquote().run()
    const undo = () => editor.chain().focus().undo().run()
    const redo = () => editor.chain().focus().redo().run()

    const insertSceneLink = (sceneId: string, sceneTitle: string) => {
        editor.chain().focus().insertContent({
            type: 'sceneMention',
            attrs: {
                id: sceneId,
                label: sceneTitle
            }
        }).insertContent(' ').run()
    }

    return (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-[#cbb26a]/30 bg-white/40 backdrop-blur-md p-2 shadow-sm rounded-t-md">
            <div className="flex items-center gap-1 mr-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!editor.can().undo()}
                    className="h-8 w-8 p-0"
                >
                    <Undo className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={redo}
                    disabled={!editor.can().redo()}
                    className="h-8 w-8 p-0"
                >
                    <Redo className="h-4 w-4" />
                </Button>
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <div className="flex items-center gap-1">
                <Button
                    variant={editor.isActive("bold") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={toggleBold}
                    className="h-8 w-8 p-0"
                >
                    <Bold className="h-4 w-4" />
                </Button>
                <Button
                    variant={editor.isActive("italic") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={toggleItalic}
                    className="h-8 w-8 p-0"
                >
                    <Italic className="h-4 w-4" />
                </Button>
                <Button
                    variant={editor.isActive("strike") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={toggleStrike}
                    className="h-8 w-8 p-0"
                >
                    <Strikethrough className="h-4 w-4" />
                </Button>
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <div className="flex items-center gap-1">
                <Button
                    variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleHeading(1)}
                    className="h-8 w-8 p-0 font-bold"
                >
                    H1
                </Button>
                <Button
                    variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleHeading(2)}
                    className="h-8 w-8 p-0 font-bold"
                >
                    H2
                </Button>
                <Button
                    variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleHeading(3)}
                    className="h-8 w-8 p-0 font-bold"
                >
                    H3
                </Button>
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <div className="flex items-center gap-1">
                <Button
                    variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={toggleBulletList}
                    className="h-8 w-8 p-0"
                >
                    <List className="h-4 w-4" />
                </Button>
                <Button
                    variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={toggleOrderedList}
                    className="h-8 w-8 p-0"
                >
                    <ListOrdered className="h-4 w-4" />
                </Button>
                <Button
                    variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={toggleBlockquote}
                    className="h-8 w-8 p-0"
                >
                    <Quote className="h-4 w-4" />
                </Button>
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground">
                        <LinkIcon className="h-4 w-4" />
                        <span className="text-xs font-medium">Lien Scène</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px]">
                    {scenes.length > 0 ? (
                        scenes.map((scene) => (
                            <DropdownMenuItem
                                key={scene.id}
                                onClick={() => insertSceneLink(scene.id, scene.title)}
                                className="cursor-pointer"
                            >
                                {scene.title || "Scène sans titre"}
                            </DropdownMenuItem>
                        ))
                    ) : (
                        <DropdownMenuItem disabled>
                            Aucune autre scène disponible
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

        </div>
    )
}
