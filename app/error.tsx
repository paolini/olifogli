'use client' // Error boundaries must be Client Components
 
import { useEffect } from 'react'
import Button from './components/Button'
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])
 
  return (
    <div>
      <h2>Qualcosa è andato storto!</h2>
      <p>{`${error}`}</p>
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Riprova
      </Button>
    </div>
  )
}