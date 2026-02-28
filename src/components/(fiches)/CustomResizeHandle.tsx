import React from 'react';
import { GripVertical } from 'lucide-react';

export const CustomResizeHandle = React.forwardRef<HTMLDivElement, any>((props, ref) => {
  const { handleAxis, className, ...restProps } = props;
  
  if (handleAxis === 'e') {
    return (
      <div 
        ref={ref} 
        className={`${className} absolute flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-50 cursor-col-resize w-4 h-full right-0 top-0`}
        {...restProps}
      >
        <div className="z-10 flex h-6 w-3 items-center justify-center rounded-sm border bg-[#242424] border-gray-600 shadow-sm text-gray-400">
          <GripVertical className="h-3 w-3" />
        </div>
      </div>
    );
  }
  
  if (handleAxis === 's') {
    return (
      <div 
        ref={ref} 
        className={`${className} absolute flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-50 cursor-row-resize h-4 w-full bottom-0 left-0`}
        {...restProps}
      >
        <div className="z-10 flex h-3 w-6 items-center justify-center rounded-sm border bg-[#242424] border-gray-600 shadow-sm text-gray-400 rotate-90">
          <GripVertical className="h-3 w-3" />
        </div>
      </div>
    );
  }
  
  if (handleAxis === 'se') {
    return (
      <div 
        ref={ref} 
        className={`${className} absolute flex items-end justify-end opacity-0 group-hover:opacity-100 transition-opacity z-50 cursor-nwse-resize w-6 h-6 bottom-0 right-0 p-1`}
        {...restProps}
      >
        <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-gray-500 rounded-br-[2px]" />
      </div>
    );
  }

  return <div ref={ref} className={className} {...restProps} />;
});
CustomResizeHandle.displayName = "CustomResizeHandle";
