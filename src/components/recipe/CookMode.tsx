// components/recipe/CookMode.tsx - Dedicated chef workflow
import React, { useState } from 'react';
import { Recipe, RecipeIngredient } from '../../types';
import Button from '../ui/Button';

interface Props {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
}

export default function CookMode({ recipe, ingredients }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [timer, setTimer] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  
  const steps = recipe.method?.split('\n').filter(step => step.trim()) || [];
  
  const handleStepComplete = (index: number) => {
    const newCompleted = new Set(completedSteps);
    if (completedSteps.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedSteps(newCompleted);
    
    // Auto advance to next step if completing current
    if (!completedSteps.has(index) && index === currentStep && index < steps.length - 1) {
      setCurrentStep(index + 1);
    }
  };
  
  const startTimer = (minutes: number) => {
    setTimer(minutes * 60);
    setTimerActive(true);
  };
  
  return (
    <div className="cook-mode">
      <header className="cook-header">
        <h2>{recipe.name} - Cook Mode</h2>
        <div className="cook-controls">
          <Button onClick={() => setCurrentStep(0)} variant="ghost">
            Restart
          </Button>
        </div>
      </header>
      
      <div className="cook-layout">
        <div className="ingredients-panel">
          <h3>Ingredients</h3>
          <ul className="ingredients-list">
            {ingredients.map(ing => (
              <li key={ing.id} className="ingredient-item">
                <span className="quantity">{ing.quantity}{ing.unit}</span>
                <span className="name">{ing.name}</span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="steps-panel">
          <h3>Steps</h3>
          <div className="steps-list">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`step-item ${index === currentStep ? 'current' : ''} ${
                  completedSteps.has(index) ? 'completed' : ''
                }`}
                onClick={() => setCurrentStep(index)}
              >
                <div className="step-header">
                  <span className="step-number">Step {index + 1}</span>
                  <Button
                    size="small"
                    variant={completedSteps.has(index) ? 'success' : 'secondary'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStepComplete(index);
                    }}
                  >
                    {completedSteps.has(index) ? '✓ Done' : 'Mark Done'}
                  </Button>
                </div>
                <p className="step-text">{step}</p>
                
                {/* Timer suggestions based on step text */}
                {step.toLowerCase().includes('bake') && (
                  <div className="timer-suggestions">
                    <Button size="small" onClick={() => startTimer(15)}>15 min</Button>
                    <Button size="small" onClick={() => startTimer(30)}>30 min</Button>
                    <Button size="small" onClick={() => startTimer(45)}>45 min</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {timerActive && timer !== null && (
          <div className="timer-panel">
            <TimerDisplay
              seconds={timer}
              onComplete={() => setTimerActive(false)}
              onClose={() => setTimerActive(false)}
            />
          </div>
        )}
      </div>
      
      <style>{`
        .cook-mode {
          min-height: 600px;
          background: var(--surface);
          border-radius: 12px;
          overflow: hidden;
        }
        
        .cook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          background: var(--surface-secondary);
          border-bottom: 1px solid var(--border);
        }
        
        .cook-header h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        
        .cook-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          height: calc(100% - 80px);
        }
        
        .ingredients-panel {
          padding: 1.5rem;
          background: var(--surface);
          border-right: 1px solid var(--border);
        }
        
        .ingredients-panel h3 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 1rem 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .ingredients-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .ingredient-item {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--border);
          font-size: 0.875rem;
        }
        
        .ingredient-item .quantity {
          font-weight: 600;
          color: var(--primary);
        }
        
        .steps-panel {
          padding: 1.5rem;
          overflow-y: auto;
          max-height: 600px;
        }
        
        .steps-panel h3 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 1rem 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .steps-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .step-item {
          padding: 1rem;
          background: var(--surface-secondary);
          border-radius: 8px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .step-item.current {
          border-color: var(--primary);
          background: var(--surface);
        }
        
        .step-item.completed {
          opacity: 0.6;
          background: var(--surface-secondary);
        }
        
        .step-item.completed .step-text {
          text-decoration: line-through;
        }
        
        .step-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        
        .step-number {
          font-weight: 600;
          color: var(--text-secondary);
          font-size: 0.75rem;
          text-transform: uppercase;
        }
        
        .step-text {
          margin: 0;
          color: var(--text-primary);
          font-size: 0.875rem;
          line-height: 1.5;
        }
        
        .timer-suggestions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border);
        }
        
        .timer-panel {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          z-index: 1000;
        }
        
        @media (max-width: 768px) {
          .cook-layout {
            grid-template-columns: 1fr;
          }
          
          .ingredients-panel {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
        }
      `}</style>
    </div>
  );
}

// Timer component
function TimerDisplay({ seconds, onComplete, onClose }: { 
  seconds: number; 
  onComplete: () => void;
  onClose: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  
  React.useEffect(() => {
    if (timeLeft <= 0) {
      onComplete();
      return;
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft, onComplete]);
  
  const minutes = Math.floor(timeLeft / 60);
  const remainingSeconds = timeLeft % 60;
  
  return (
    <div className="timer-display">
      <div className="timer-value">
        {minutes}:{remainingSeconds.toString().padStart(2, '0')}
      </div>
      <button onClick={onClose} className="timer-close">×</button>
      
      <style>{`
        .timer-display {
          background: var(--primary);
          color: white;
          padding: 1rem 2rem;
          border-radius: 50px;
          box-shadow: var(--shadow-lg);
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: 1.5rem;
          font-weight: 700;
        }
        
        .timer-close {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.2rem;
        }
        
        .timer-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}