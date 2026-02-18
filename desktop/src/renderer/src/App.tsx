import { ThemeProvider } from './themes/ThemeProvider'
import { Overlay } from './components/Overlay'
import { InsightsWindow } from './components/InsightsWindow'

function useWindowRole(): 'main' | 'insights' {
  if (typeof window === 'undefined') return 'main'
  const params = new URLSearchParams(window.location.search)
  return params.get('view') === 'insights' ? 'insights' : 'main'
}

export default function App() {
  const role = useWindowRole()

  return (
    <ThemeProvider>
      {role === 'insights' ? <InsightsWindow /> : <Overlay />}
    </ThemeProvider>
  )
}
