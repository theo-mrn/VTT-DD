"use client"

import React from 'react';
import { motion } from 'framer-motion';

interface CharacterBubbleProps {
  content: string;
  type: 'emoji' | 'text';
  x: number;
  y: number;
  iconRadius: number;
}

const CharacterBubble = React.memo(({ content, type, x, y, iconRadius }: CharacterBubbleProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.6 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'absolute',
        left: x,
        top: y - iconRadius - 12,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(type === 'emoji'
          ? {
            fontSize: '28px',
            lineHeight: 1,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }
          : {
            maxWidth: '160px',
            padding: '4px 10px',
            borderRadius: '12px',
            background: 'rgba(20, 20, 20, 0.85)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          }),
      }}
    >
      {content}
    </motion.div>
  );
});

CharacterBubble.displayName = 'CharacterBubble';

export default CharacterBubble;
