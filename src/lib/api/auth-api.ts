import { supabase } from '../supabase';
import { User, Restaurant } from '../types';

export const authApi = {
  async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) throw new Error(error.message);
    
    // Create a restaurant for the user
    if (data.user) {
      await this.createRestaurantForUser(data.user.id, `${fullName}'s Restaurant`);
    }
    
    return data;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async createRestaurantForUser(userId: string, name: string): Promise<Restaurant> {
    const { data, error } = await supabase
      .from('restaurants')
      .insert([{ name, created_by: userId }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Restaurant;
  },

  async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);
    return data as User;
  },

  async updateUserProfile(userId: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as User;
  }
};