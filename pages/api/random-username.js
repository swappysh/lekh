import { generate } from 'random-words'
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  // Method validation
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    let attempts = 0
    while (attempts < 20) {
      const candidate = generate(2).join('-')
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', candidate)

      if (error) {
        return res.status(500).json({ error: 'Database error occurred' })
      }

      if (!data || data.length === 0) {
        return res.status(200).json({ username: candidate })
      }

      attempts++
    }

    // Enhanced fallback with more uniqueness
    const fallback = `${generate(2).join('-')}-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substr(2, 2)}`
    return res.status(200).json({ username: fallback })
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
