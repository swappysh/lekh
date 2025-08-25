import { generate } from 'random-words'
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  let attempts = 0
  while (attempts < 20) {
    const candidate = generate(2).join('-')
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', candidate)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    if (!data || data.length === 0) {
      return res.status(200).json({ username: candidate })
    }

    attempts++
  }

  const fallback = `${generate(2).join('-')}-${Date.now().toString().slice(-4)}`
  res.status(200).json({ username: fallback })
}
