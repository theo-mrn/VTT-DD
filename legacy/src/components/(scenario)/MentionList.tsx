import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export interface MentionListProps {
    items: any[]
    command: (item: any) => void
}

export const MentionList = forwardRef((props: MentionListProps, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    const selectItem = (index: number) => {
        const item = props.items[index]
        if (item) {
            props.command({ id: item.id, label: item.label })
        }
    }

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
    }

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
    }

    const enterHandler = () => {
        selectItem(selectedIndex)
    }

    useEffect(() => setSelectedIndex(0), [props.items])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                upHandler()
                return true
            }

            if (event.key === 'ArrowDown') {
                downHandler()
                return true
            }

            if (event.key === 'Enter') {
                enterHandler()
                return true
            }

            return false
        },
    }))

    return (
        <div className="bg-popover text-popover-foreground border border-border shadow-md rounded-md overflow-hidden p-1 flex flex-col gap-1 min-w-[12rem]">
            {props.items.length ? (
                props.items.map((item, index) => (
                    <button
                        className={`w-full text-left px-2 py-1.5 text-sm rounded-sm transition-colors ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                            }`}
                        key={index}
                        onClick={() => selectItem(index)}
                    >
                        {item.label}
                    </button>
                ))
            ) : (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucun résultat</div>
            )}
        </div>
    )
})

MentionList.displayName = 'MentionList'
