import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { SuggestionOptions } from '@tiptap/suggestion'
import { MentionList } from './MentionList'

export default function getSceneSuggestionConfig(scenes: { id: string, title: string }[]): Omit<SuggestionOptions, 'editor'> {
    return {
        allowSpaces: true,
        char: '#',
        items: ({ query: text }) => {
            if (!scenes) return []

            const allScenes = scenes.map(scene => ({
                id: scene.id,
                label: scene.title || "Scène sans titre"
            }))

            return allScenes.filter(item => item.label.toLowerCase().includes(text.toLowerCase())).slice(0, 5)
        },
        render: () => {
            let reactRenderer: any
            let popup: TippyInstance<any>[]

            return {
                onStart: props => {
                    if (!props.clientRect) {
                        return
                    }

                    reactRenderer = new ReactRenderer(MentionList, {
                        props,
                        editor: props.editor,
                    })

                    popup = tippy('body', {
                        getReferenceClientRect: props.clientRect as any,
                        appendTo: () => document.body,
                        content: reactRenderer.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: 'bottom-start',
                    })
                },
                onUpdate: props => {
                    reactRenderer.updateProps(props)

                    if (!props.clientRect) {
                        return
                    }

                    popup[0].setProps({
                        getReferenceClientRect: props.clientRect as any,
                    })
                },
                onKeyDown: props => {
                    if (props.event.key === 'Escape') {
                        popup[0].hide()
                        return true
                    }

                    return reactRenderer.ref?.onKeyDown(props)
                },
                onExit: () => {
                    if (popup && popup.length > 0) {
                        popup[0].destroy()
                    }
                    if (reactRenderer) {
                        reactRenderer.destroy()
                    }
                },
            }
        },
    }
}
