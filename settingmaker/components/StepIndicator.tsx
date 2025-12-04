
import React from 'react';
import { AppStep } from '../types';

interface Props {
  currentStep: AppStep;
}

const StepIndicator: React.FC<Props> = ({ currentStep }) => {
  const steps = [
    { id: AppStep.INPUT, label: 'Story Input' },
    { id: AppStep.ARCHITECT, label: 'Architect Blueprint' },
    { id: AppStep.SCRIPT, label: 'Script Factory' },
  ];

  return (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isPast = steps.findIndex(s => s.id === currentStep) > index;
        
        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300
                ${isActive || isPast ? 'border-gold-500 bg-gold-500/20 text-gold-400' : 'border-slate-700 text-slate-700'}
              `}
            >
              <span className="font-tech text-xs">{index + 1}</span>
            </div>
            <span className={`ml-2 text-sm font-display tracking-wider ${isActive ? 'text-gold-400' : 'text-slate-600'}`}>
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <div className={`w-8 h-[1px] ml-4 ${isPast ? 'bg-gold-500' : 'bg-slate-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;
