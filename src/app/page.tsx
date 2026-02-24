'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calculator, ChefHat, Users, BarChart3, Settings } from 'lucide-react'

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <ChefHat className="h-8 w-8 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-900">GastroChef Next</h1>
          </div>
          <nav className="flex space-x-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <section className="text-center py-12">
          <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
            Recipe Costing Made Simple
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
            Professional-grade recipe costing and ingredient management for restaurants and central kitchens.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/register">Start Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16">
          <h3 className="text-3xl font-bold text-center text-gray-900 mb-12">Powerful Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card>
              <CardHeader>
                <Calculator className="h-10 w-10 text-blue-500" />
                <CardTitle>Automatic Costing</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Real-time recipe cost calculations with ingredient yields, waste factors, and portion costs.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <ChefHat className="h-10 w-10 text-green-500" />
                <CardTitle>Recipe Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Create, organize, and scale recipes with detailed instructions and ingredient lists.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-purple-500" />
                <CardTitle>Team Collaboration</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Role-based access control for owners, chefs, and kitchen staff.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-orange-500" />
                <CardTitle>Analytics & Reporting</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Track food costs, margins, and performance with detailed reports.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Dashboard Preview */}
        <section className="py-16">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="recipes">Recipes</TabsTrigger>
              <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
              <TabsTrigger value="costing">Costing</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="dashboard" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Business Overview</CardTitle>
                  <CardDescription>Key metrics for your kitchen operations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm font-medium text-blue-700">Food Cost %</p>
                      <p className="text-2xl font-bold">28.4%</p>
                      <p className="text-xs text-gray-500">Target: &lt;30%</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm font-medium text-green-700">Avg. Recipe Cost</p>
                      <p className="text-2xl font-bold">$4.25</p>
                      <p className="text-xs text-gray-500">Per portion</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm font-medium text-purple-700">Active Recipes</p>
                      <p className="text-2xl font-bold">142</p>
                      <p className="text-xs text-gray-500">+5 this week</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="recipes" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recipe Builder</CardTitle>
                  <CardDescription>Create and manage your recipes</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Advanced recipe editor with cost calculations, instructions, and image support.</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="ingredients" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ingredient Management</CardTitle>
                  <CardDescription>Track inventory and costs</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Manage ingredients with pack sizes, yields, suppliers, and cost tracking.</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="costing" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cost Analysis</CardTitle>
                  <CardDescription>Detailed cost breakdowns</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Comprehensive cost analysis with historical tracking and forecasting.</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="settings" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Kitchen Settings</CardTitle>
                  <CardDescription>Configure your kitchen operations</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Manage kitchen information, currencies, and operational settings.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* CTA Section */}
        <section className="py-16 text-center">
          <h3 className="text-3xl font-bold text-gray-900 mb-4">Ready to Optimize Your Kitchen Costs?</h3>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Join hundreds of restaurants and central kitchens using GastroChef Next to reduce food costs and improve profitability.
          </p>
          <Button size="lg" asChild>
            <Link href="/register">Start Your Free Trial Today</Link>
          </Button>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex items-center space-x-2">
              <ChefHat className="h-6 w-6 text-orange-500" />
              <p className="text-lg font-semibold text-gray-900">GastroChef Next</p>
            </div>
            <p className="mt-4 text-base text-gray-500 md:mt-0">
              &copy; {new Date().getFullYear()} GastroChef Next. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}