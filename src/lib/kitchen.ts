// src/lib/kitchen.ts
import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

interface KitchenContextType {
  kitchenId: string | null
  setKitchenId: (id: string | null) => void
  kitchen: any | null
  isOwner: boolean
}

const KitchenContext = createContext<KitchenContextType | undefined>(undefined)

export function KitchenProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [kitchenId, setKitchenId] = useState<string | null>(() => {
    return localStorage.getItem('kitchenId')
  })
  const [kitchen, setKitchen] = useState<any | null>(null)
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    if (kitchenId) {
      loadKitchen()
      localStorage.setItem('kitchenId', kitchenId)
    }
  }, [kitchenId])

  const loadKitchen = async () => {
    const { data } = await supabase
      .from('kitchens')
      .select('*')
      .eq('id', kitchenId)
      .single()
    
    if (data) {
      setKitchen(data)
      setIsOwner(data.owner_id === user?.id)
    }
  }

  const handleSetKitchenId = (id: string | null) => {
    setKitchenId(id)
    if (!id) localStorage.removeItem('kitchenId')
  }

  return (
    <KitchenContext.Provider value={{
      kitchenId,
      setKitchenId: handleSetKitchenId,
      kitchen,
      isOwner
    }}>
      {children}
    </KitchenContext.Provider>
  )
}

export function useKitchen() {
  const context = useContext(KitchenContext)
  if (!context) throw new Error('useKitchen must be used within KitchenProvider')
  return context
}
