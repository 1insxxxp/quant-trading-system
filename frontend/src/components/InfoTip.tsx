import React from 'react';

interface InfoTipProps {
  content: string;
  label?: string;
}

export const InfoTip: React.FC<InfoTipProps> = ({ content, label = '查看说明' }) => (
  <span className="info-tip" data-tooltip-root="true">
    <button type="button" className="info-tip__trigger" aria-label={label}>
      i
    </button>
    <span role="tooltip" className="info-tip__bubble">
      {content}
    </span>
  </span>
);
