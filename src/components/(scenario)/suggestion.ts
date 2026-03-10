import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { SuggestionOptions } from '@tiptap/suggestion'
import { MentionList } from './MentionList'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface CharacterItem {
    id: string
    label: string
}

export default function getSuggestionConfig(roomId: string): Omit<SuggestionOptions, 'editor'> {
    return {
        allowSpaces: true,
        char: '@',
        items: async ({ query: text }) => {
            if (!roomId) return []

            try {
                const charsRef = collection(db, `cartes/${roomId}/characters`)
                const snapshot = await getDocs(charsRef)
                const allChars = snapshot.docs.map(doc => {
                    const data = doc.data()
                    return {
                        id: doc.id,
                        label: data.Nomperso || "Inconnu"
                    }
                })

                return allChars.filter(item => item.label.toLowerCase().includes(text.toLowerCase())).slice(0, 5)
            } catch (error) {
                console.error("Error fetching characters for mentions:", error)
                return []
            }
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
                    popup[0].destroy()
                    reactRenderer.destroy()
                },
            }
        },
    }
}
