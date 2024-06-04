import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import Home from '../src/app/page'
 
describe('Render', () => {
  it('renders the page', () => {
    render(<Home />)
 
    const configuration = screen.getByText('Configuration')
    const navigation_configuration = screen.getByText('Navigation Configuration')
    const settings = screen.getByText('Settings')
    const hdri = screen.getByText('Generate HDR Image')
 
    expect(configuration).toBeInTheDocument()
    expect(navigation_configuration).toBeInTheDocument()
    expect(settings).toBeInTheDocument()
    expect(hdri).toBeInTheDocument()
  })
})