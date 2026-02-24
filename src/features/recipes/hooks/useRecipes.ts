import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Recipe } from '@/types';

// Mock API service - would be replaced with actual Supabase calls
const recipeApi = {
  getAll: async (): Promise<Recipe[]> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    return [
      {
        id: '1',
        title: 'Spaghetti Carbonara',
        description: 'Classic Italian pasta dish with eggs, cheese, pancetta, and pepper',
        instructions: '1. Cook pasta\n2. Fry pancetta\n3. Mix eggs and cheese\n4. Combine all ingredients',
        prep_time: 15,
        cook_time: 15,
        total_time: 30,
        servings: 4,
        difficulty: 'medium',
        cuisine_type: 'Italian',
        dietary_tags: ['gluten-free-option'],
        status: 'published',
        image_url: '',
        video_url: '',
        created_by: 'user-1',
        restaurant_id: 'rest-1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        total_cost: 12.50,
        cost_per_portion: 3.13,
        calories: 650,
        protein: 18,
        carbs: 78,
        fat: 26
      },
      {
        id: '2',
        title: 'Chicken Tikka Masala',
        description: 'Creamy Indian curry with marinated chicken',
        instructions: '1. Marinate chicken\n2. Grill chicken\n3. Prepare sauce\n4. Combine and simmer',
        prep_time: 30,
        cook_time: 45,
        total_time: 75,
        servings: 6,
        difficulty: 'hard',
        cuisine_type: 'Indian',
        dietary_tags: ['gluten-free'],
        status: 'published',
        image_url: '',
        video_url: '',
        created_by: 'user-1',
        restaurant_id: 'rest-1',
        created_at: '2023-01-02T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        total_cost: 28.75,
        cost_per_portion: 4.79,
        calories: 420,
        protein: 28,
        carbs: 18,
        fat: 24
      }
    ];
  },

  getById: async (id: string): Promise<Recipe> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 300));
    const recipes = await recipeApi.getAll();
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) throw new Error(`Recipe with id ${id} not found`);
    return recipe;
  },

  create: async (recipe: Omit<Recipe, 'id' | 'created_at' | 'updated_at'>): Promise<Recipe> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
      ...recipe,
      id: `recipe-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as Recipe;
  },

  update: async (id: string, recipe: Partial<Recipe>): Promise<Recipe> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
      ...(await recipeApi.getById(id)),
      ...recipe,
      updated_at: new Date().toISOString()
    };
  },

  delete: async (id: string): Promise<void> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`Recipe ${id} deleted`);
  }
};

export const useRecipes = () => {
  const queryClient = useQueryClient();

  const { data: recipes = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['recipes'],
    queryFn: recipeApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const createRecipeMutation = useMutation({
    mutationFn: recipeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });

  const updateRecipeMutation = useMutation({
    mutationFn: ({ id, recipe }: { id: string; recipe: Partial<Recipe> }) => 
      recipeApi.update(id, recipe),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe'] }); // Invalidate specific recipe queries too
    },
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: recipeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });

  return {
    recipes,
    isLoading,
    isError,
    refetch,
    createRecipe: createRecipeMutation.mutateAsync,
    updateRecipe: (id: string, recipe: Partial<Recipe>) => 
      updateRecipeMutation.mutateAsync({ id, recipe }),
    deleteRecipe: deleteRecipeMutation.mutateAsync,
    isCreating: createRecipeMutation.isPending,
    isUpdating: updateRecipeMutation.isPending,
    isDeleting: deleteRecipeMutation.isPending,
  };
};

export const useRecipe = (id: string) => {
  return useQuery({
    queryKey: ['recipe', id],
    queryFn: () => recipeApi.getById(id),
    enabled: !!id,
  });
};