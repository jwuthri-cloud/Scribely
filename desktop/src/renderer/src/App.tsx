import { ThemeProvider } from './themes/ThemeProvider'
import { Overlay } from './components/Overlay'

export default function App() {
  return (
    <ThemeProvider>
      <Overlay />
    </ThemeProvider>
  )
}
