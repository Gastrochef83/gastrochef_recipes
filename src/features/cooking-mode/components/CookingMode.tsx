import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Recipe } from '@/types';

interface CookingModeProps {
  recipe: Recipe;
  onClose: () => void;
}

const CookingMode: React.FC<CookingModeProps> = ({ recipe, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  
  const instructions = recipe.instructions.split('\n').filter(step => step.trim() !== '');
  
  const handleNextStep = () => {
    if (currentStep < instructions.length - 1) {
      setCurrentStep(currentStep + 1);
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
    }
  };
  
  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const toggleStepCompletion = (index: number) => {
    if (completedSteps.includes(index)) {
      setCompletedSteps(completedSteps.filter(i => i !== index));
    } else {
      setCompletedSteps([...completedSteps, index]);
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50 overflow-auto p-4"
    >
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{recipe.title}</h1>
          <Button variant="outline" onClick={onClose}>
            Exit Cooking Mode
          </Button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recipe Info Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Recipe Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Servings</h3>
                    <p className="text-2xl">{recipe.servings}</p>
                  </div>
                  
                  <div>
                    <h3 className="font-medium">Total Time</h3>
                    <p className="text-2xl">{recipe.total_time} min</p>
                  </div>
                  
                  <div>
                    <h3 className="font-medium">Difficulty</h3>
                    <p className="text-2xl capitalize">{recipe.difficulty}</p>
                  </div>
                  
                  {recipe.description && (
                    <div>
                      <h3 className="font-medium">Description</h3>
                      <p>{recipe.description}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Instructions Panel */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Cooking Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">
                      Step {currentStep + 1} of {instructions.length}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(((currentStep + 1) / instructions.length) * 100)}% Complete
                    </span>
                  </div>
                  
                  <div className="bg-primary/10 p-6 rounded-lg mb-6">
                    <p className="text-xl leading-relaxed">{instructions[currentStep]}</p>
                  </div>
                  
                  <div className="flex justify-between">
                    <Button 
                      variant="outline" 
                      onClick={handlePrevStep} 
                      disabled={currentStep === 0}
                      className="text-lg py-6 px-8"
                    >
                      Previous
                    </Button>
                    
                    <Button 
                      onClick={handleNextStep} 
                      disabled={currentStep === instructions.length - 1}
                      className="text-lg py-6 px-8"
                    >
                      Next Step
                    </Button>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-3">All Steps</h3>
                  <div className="space-y-2">
                    {instructions.map((step, index) => (
                      <div 
                        key={index} 
                        className={`flex items-start p-3 rounded-lg cursor-pointer ${
                          index === currentStep 
                            ? 'bg-primary/20 border-l-4 border-primary' 
                            : completedSteps.includes(index)
                              ? 'bg-green-50'
                              : 'hover:bg-muted'
                        }`}
                        onClick={() => setCurrentStep(index)}
                      >
                        <input
                          type="checkbox"
                          checked={completedSteps.includes(index)}
                          onChange={() => toggleStepCompletion(index)}
                          className="mt-1 mr-3 h-5 w-5"
                        />
                        <span className={completedSteps.includes(index) ? 'line-through text-muted-foreground' : ''}>
                          {index + 1}. {step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default CookingMode;