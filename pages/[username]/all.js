import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AllEntriesPage() {
  const router = useRouter()
  const { username } = router.query
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [userExists, setUserExists] = useState(null)

  const loadAllEntries = async () => {
    if (!username) return
    
    setLoading(true)
    
    // Check if user exists
    const { data: userData } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
    
    if (!userData || userData.length === 0) {
      setUserExists(false)
      setLoading(false)
      return
    }
    
    setUserExists(true)
    
    // Fetch all documents for this user
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('username', username)
      .order('updated_at', { ascending: false })
    
    setEntries(documents || [])
    setLoading(false)
  }

  useEffect(() => {
    if (username) {
      loadAllEntries()
    }
  }, [username])

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
        <style jsx>{`
          .container {
            padding: 20px;
            font-family: monospace;
            width: 70vw;
            margin: 0 auto;
          }
          .loading {
            text-align: center;
            padding: 40px;
          }
        `}</style>
      </div>
    )
  }

  if (userExists === false) {
    return (
      <div className="container">
        <h1>User Not Found</h1>
        <p>The user "{username}" doesn't exist.</p>
        <p><a href="/users">Create a new user URL</a></p>
        <style jsx global>{`
          body {
            background: #FAFAF7;
            color: #111111;
            font-size: 18px;
            line-height: 1.6;
          }
          @media (prefers-color-scheme: dark) {
            body {
              background: #0B0B0C;
              color: #EDEDED;
            }
          }
          a {
            color: #0B57D0;
            text-decoration: underline;
          }
          a:visited {
            color: #6B4FD3;
          }
          @media (prefers-color-scheme: dark) {
            a {
              color: #8AB4F8;
            }
            a:visited {
              color: #B39DDB;
            }
          }
        `}</style>
        <style jsx>{`
          .container {
            padding: 20px;
            font-family: monospace;
            width: 70vw;
            margin: 0 auto;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header">
        <h1>{username} - All Entries</h1>
        <p><a href={`/${username}`}>← Back to write</a></p>
      </div>
      
      {entries.length === 0 ? (
        <div className="no-entries">
          <p>No entries found for {username}</p>
        </div>
      ) : (
        <div className="entries-list">
          {entries.map((entry) => (
            <div key={entry.id} className="entry">
              <div className="entry-header">
                <span className="entry-date">
                  {new Date(entry.updated_at).toLocaleString()}
                </span>
              </div>
              <div className="entry-content">
                {entry.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        body {
          background: #FAFAF7;
          color: #111111;
          font-size: 18px;
          line-height: 1.6;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: #0B0B0C;
            color: #EDEDED;
          }
        }
        a {
          color: #0B57D0;
          text-decoration: underline;
        }
        a:visited {
          color: #6B4FD3;
        }
        @media (prefers-color-scheme: dark) {
          a {
            color: #8AB4F8;
          }
          a:visited {
            color: #B39DDB;
          }
        }
      `}</style>
      
      <style jsx>{`
        .container {
          padding: 20px;
          font-family: monospace;
          width: 70vw;
          margin: 0 auto;
        }
        .header {
          margin-bottom: 30px;
        }
        .header h1 {
          margin-bottom: 10px;
        }
        .header p {
          margin: 0;
        }
        .no-entries {
          text-align: center;
          padding: 40px 0;
        }
        .entries-list {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }
        .entry {
          border-bottom: 1px solid #ddd;
          padding-bottom: 20px;
        }
        .entry:last-child {
          border-bottom: none;
        }
        .entry-header {
          margin-bottom: 10px;
        }
        .entry-date {
          font-size: 14px;
          color: #666;
          font-weight: bold;
        }
        .entry-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        @media (prefers-color-scheme: dark) {
          .entry {
            border-bottom: 1px solid #333;
          }
          .entry-date {
            color: #999;
          }
        }
      `}</style>
    </div>
  )
}