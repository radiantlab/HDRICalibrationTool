// Makes the jest-dom matchers visible to TypeScript. The runtime registration
// happens in jest.setup.js, but that file is JavaScript and outside the type
// program, so the module augmentation has to be pulled in here for tests that
// import expect from @jest/globals.
import "@testing-library/jest-dom/jest-globals";
