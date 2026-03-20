// src/pages/RecipePage.tsx (مثال للاستخدام)
import React from "react";
import { ExportButton } from "../components/Recipe/ExportButton";

interface RecipePageProps {
  recipe: {
    id: string;
    title: string;
    // ... other recipe data
  };
}

export const RecipePage: React.FC<RecipePageProps> = ({ recipe }) => {
  return (
    <div className="container mx-auto p-4">
      {/* Recipe Card Container */}
      <div id="recipe-print-card" className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="relative h-64 bg-gradient-to-r from-purple-500 to-pink-500">
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <h1 className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-2xl font-bold p-4">
            {recipe.title}
          </h1>
        </div>
        
        {/* Recipe content */}
        <div className="p-6">
          {/* ... recipe details ... */}
        </div>
      </div>

      {/* Export Button */}
      <div className="mt-6 flex justify-center">
        <ExportButton
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          elementId="recipe-print-card"
          onExportStart={() => console.log("Export started")}
          onExportComplete={() => console.log("Export completed")}
          onExportError={(error) => console.error("Export error:", error)}
        />
      </div>
    </div>
  );
};
