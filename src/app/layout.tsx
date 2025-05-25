/**
 * Root layout component for the HDRI Calibration Tool application.
 * 
 * This component serves as the main wrapper for all pages in the application.
 * It includes the global font settings, metadata for the app, initialization component,
 * and the navigation bar that appears on all pages.
 */
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navigation from './navigation'
import Initialization from './init'

// Configure the Inter font from Google Fonts
const inter = Inter({ subsets: ['latin'] })

// Define metadata for the application
export const metadata: Metadata = {
  title: 'HDRI Calibration Tool',
  description: 'Tool for calibrating High Dynamic Range Images',
}

/**
 * Root layout component that wraps all pages in the application.
 * 
 * @param children - The child components/pages to be rendered within the layout
 * @returns The complete HTML structure for the application
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Initialize the application settings */}
        <Initialization />
        {/* Render the navigation bar */}
        <Navigation />
        {/* Render the current page content */}
        <div>{children}</div>
      </body>
    </html>
  )
}