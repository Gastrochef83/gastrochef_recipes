import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Recipe } from '@/types';

interface RecipeListProps {
  recipes: Recipe[];
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
}

const RecipeList: React.FC<RecipeListProps> = ({ recipes, onEdit, onDelete, onCreateNew }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="container mx-auto py-6"
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <Button onClick={onCreateNew}>New Recipe</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map((recipe) => (
          <motion.div
            key={recipe.id}
            whileHover={{ y: -5 }}
            layout
          >
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-xl">{recipe.title}</CardTitle>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{recipe.servings} servings</span>
                  <span>{recipe.prep_time + recipe.cook_time} min</span>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-muted-foreground mb-4 line-clamp-2">
                  {recipe.description}
                </p>
                <div className="flex justify-between items-center mt-auto">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    recipe.status === 'published' 
                      ? 'bg-green-100 text-green-800' 
                      : recipe.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}>
                    {recipe.status.charAt(0).toUpperCase() + recipe.status.slice(1)}
                  </span>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onEdit(recipe)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => onDelete(recipe.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      
      {recipes.length === 0 && (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No recipes yet</h3>
          <p className="text-muted-foreground mt-2">
            Get started by creating your first recipe
          </p>
          <Button className="mt-4" onClick={onCreateNew}>
            Create Recipe
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default RecipeList;