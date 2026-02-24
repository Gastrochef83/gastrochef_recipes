import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Recipe, Ingredient } from '@/types';

interface RecipeEditorProps {
  recipe?: Recipe;
  ingredients: Ingredient[];
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
}

const RecipeEditor: React.FC<RecipeEditorProps> = ({ recipe, ingredients, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Recipe>({
    id: recipe?.id || '',
    title: recipe?.title || '',
    description: recipe?.description || '',
    instructions: recipe?.instructions || '',
    prep_time: recipe?.prep_time || 0,
    cook_time: recipe?.cook_time || 0,
    total_time: recipe?.total_time || 0,
    servings: recipe?.servings || 1,
    difficulty: recipe?.difficulty || 'medium',
    cuisine_type: recipe?.cuisine_type || '',
    dietary_tags: recipe?.dietary_tags || [],
    status: recipe?.status || 'draft',
    image_url: recipe?.image_url || '',
    video_url: recipe?.video_url || '',
    created_by: recipe?.created_by || '',
    restaurant_id: recipe?.restaurant_id || '',
    created_at: recipe?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Note: We'll implement recipe lines later as they're complex

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseInt(value) || 0
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="container mx-auto py-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>{recipe ? 'Edit Recipe' : 'Create New Recipe'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Recipe Title</Label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Enter recipe title"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Brief description of the recipe"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="prep_time">Prep Time (min)</Label>
                  <Input
                    id="prep_time"
                    name="prep_time"
                    type="number"
                    value={formData.prep_time}
                    onChange={handleNumberChange}
                  />
                </div>
                
                <div>
                  <Label htmlFor="cook_time">Cook Time (min)</Label>
                  <Input
                    id="cook_time"
                    name="cook_time"
                    type="number"
                    value={formData.cook_time}
                    onChange={handleNumberChange}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  value={formData.servings}
                  onChange={handleNumberChange}
                />
              </div>
              
              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <select
                  id="difficulty"
                  name="difficulty"
                  value={formData.difficulty}
                  onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value as any }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  id="instructions"
                  name="instructions"
                  value={formData.instructions}
                  onChange={handleInputChange}
                  placeholder="Step-by-step cooking instructions"
                  rows={10}
                />
              </div>
              
              <div>
                <Label htmlFor="image_url">Image URL</Label>
                <Input
                  id="image_url"
                  name="image_url"
                  value={formData.image_url}
                  onChange={handleInputChange}
                  placeholder="URL to recipe image"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Recipe
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default RecipeEditor;