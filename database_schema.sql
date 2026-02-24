-- GastroChef v5 Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with RBAC roles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'cook' CHECK (role IN ('admin', 'manager', 'chef', 'cook')),
    restaurant_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Restaurants table
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ingredients table
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    supplier VARCHAR(255),
    base_unit VARCHAR(20) NOT NULL, -- kg, g, ml, l, oz, etc.
    density DECIMAL(8,4), -- g/ml for unit conversions
    allergens TEXT[], -- array of allergen identifiers
    nutritional_info JSONB DEFAULT '{}',
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipes table
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,
    prep_time INTEGER, -- minutes
    cook_time INTEGER, -- minutes
    total_time INTEGER, -- minutes
    servings INTEGER DEFAULT 1,
    difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
    cuisine_type VARCHAR(100),
    dietary_tags TEXT[], -- array of dietary restriction tags
    status VARCHAR(20) CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
    image_url TEXT,
    video_url TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipe ingredients mapping (recipe lines)
CREATE TABLE recipe_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12,4) NOT NULL,
    unit VARCHAR(20) NOT NULL, -- could be different from base_unit
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate ingredients in same recipe
    CONSTRAINT unique_recipe_ingredient UNIQUE (recipe_id, ingredient_id)
);

-- Ingredient cost history for tracking price changes over time
CREATE TABLE ingredient_cost_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    cost_per_unit DECIMAL(10,4) NOT NULL, -- cost per base_unit
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api', 'upload')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent multiple entries for same ingredient on same day
    CONSTRAINT unique_ingredient_date UNIQUE (ingredient_id, effective_date)
);

-- Nutrition profiles for recipes (computed values)
CREATE TABLE nutrition_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID UNIQUE NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    total_calories DECIMAL(10,2),
    total_protein DECIMAL(8,2), -- grams
    total_carbs DECIMAL(8,2), -- grams
    total_fat DECIMAL(8,2), -- grams
    total_sodium DECIMAL(10,2), -- mg
    total_sugar DECIMAL(8,2), -- grams
    total_fiber DECIMAL(8,2), -- grams
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipe analytics and usage tracking
CREATE TABLE recipe_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID UNIQUE NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    ratings_avg DECIMAL(3,2) DEFAULT 0, -- 0.00 to 5.00
    ratings_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cook sessions for tracking recipe usage
CREATE TABLE cook_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) CHECK (status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_users_restaurant ON users(restaurant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_ingredients_restaurant ON ingredients(restaurant_id);
CREATE INDEX idx_ingredients_category ON ingredients(category);
CREATE INDEX idx_recipes_restaurant ON recipes(restaurant_id);
CREATE INDEX idx_recipes_status ON recipes(status);
CREATE INDEX idx_recipes_created_by ON recipes(created_by);
CREATE INDEX idx_recipe_lines_recipe ON recipe_lines(recipe_id);
CREATE INDEX idx_recipe_lines_ingredient ON recipe_lines(ingredient_id);
CREATE INDEX idx_ingredient_cost_history_ingredient ON ingredient_cost_history(ingredient_id);
CREATE INDEX idx_ingredient_cost_history_date ON ingredient_cost_history(effective_date DESC);
CREATE INDEX idx_cook_sessions_recipe ON cook_sessions(recipe_id);
CREATE INDEX idx_cook_sessions_user ON cook_sessions(user_id);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipe_lines_updated_at BEFORE UPDATE ON recipe_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- View to get recipes with computed costs and nutrition
CREATE VIEW recipe_summary AS
SELECT 
    r.*,
    COALESCE(n.total_calories, 0) as calories,
    COALESCE(n.total_protein, 0) as protein,
    COALESCE(n.total_carbs, 0) as carbs,
    COALESCE(n.total_fat, 0) as fat,
    -- Calculate total cost from latest ingredient prices
    (SELECT SUM(
        rl.quantity * (
            SELECT cost_per_unit 
            FROM ingredient_cost_history ich 
            WHERE ich.ingredient_id = rl.ingredient_id 
            ORDER BY ich.effective_date DESC 
            LIMIT 1
        )
    )
    FROM recipe_lines rl 
    WHERE rl.recipe_id = r.id) as total_cost,
    -- Calculate cost per portion
    (SELECT SUM(
        rl.quantity * (
            SELECT cost_per_unit 
            FROM ingredient_cost_history ich 
            WHERE ich.ingredient_id = rl.ingredient_id 
            ORDER BY ich.effective_date DESC 
            LIMIT 1
        )
    ) / r.servings
    FROM recipe_lines rl 
    WHERE rl.recipe_id = r.id) as cost_per_portion
FROM recipes r
LEFT JOIN nutrition_profiles n ON r.id = n.recipe_id;

-- Function to add cost history entry with validation
CREATE OR REPLACE FUNCTION add_ingredient_cost(
    p_ingredient_id UUID,
    p_cost DECIMAL,
    p_effective_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'manual',
    p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Check if there's already a cost for this ingredient on this date
    IF EXISTS (SELECT 1 FROM ingredient_cost_history 
               WHERE ingredient_id = p_ingredient_id AND effective_date = p_effective_date) THEN
        RAISE EXCEPTION 'Cost entry already exists for ingredient % on date %', p_ingredient_id, p_effective_date;
    END IF;
    
    INSERT INTO ingredient_cost_history (ingredient_id, cost_per_unit, effective_date, source, created_by)
    VALUES (p_ingredient_id, p_cost, p_effective_date, p_source, p_created_by)
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Initial data setup
INSERT INTO restaurants (id, name, owner_id) VALUES 
(uuid_generate_v4(), 'Demo Restaurant', NULL);

-- Create demo admin user
INSERT INTO users (email, first_name, last_name, role, restaurant_id) VALUES 
('admin@gastrochef.com', 'Gastro', 'Chef', 'admin', 
 (SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1));