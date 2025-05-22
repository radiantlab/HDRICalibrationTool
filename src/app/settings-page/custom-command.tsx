import React from "react";
import { DEFAULT_COMMANDS, CommandKeys, useCommandsStore, } from "../stores/command-store";


export default function CommandInput({ name, label }: { name: CommandKeys, label: string }) {
    const value = useCommandsStore((state) => state.commands[name]);
    const setCommand = useCommandsStore((state) => state.setCommand);
    const defaultValue = DEFAULT_COMMANDS[name];
    const displayedValue = value !== "" ? value : defaultValue;

    const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value === defaultValue ? 
            "" : removePlaceholderArguments(event.target.value);
        setCommand(name, newValue);
    }

    return (
        <div>
            <label className="font-semibold">{label}</label>
            <input
                type="text"
                value={displayedValue}
                onChange={handleInput}
                className="mb-3 placeholder:text-right w-full shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
            ></input>
        </div>
    );
}

function removePlaceholderArguments(input: string) {
    return input.replace(/\[[^\]]*\]/g, "").trim();
}
