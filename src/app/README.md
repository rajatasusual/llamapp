# Llamapp
![llamapp UI](https://raw.githubusercontent.com/rajatasusual/llamapp/main/src/app/assets/llama.png)

## Objective

Llamapp is designed to facilitate conversations with a locally running language model server. This chatRAG model application allows users to interact with the AI-powered RAG model, configure its behavior, and receive contextual responses with citations for additional information.

![llamapp UI](https://raw.githubusercontent.com/rajatasusual/llamapp/main/assets/response.png)


## Salient Features

1. **Interactive Chat Interface**
   - Users can send messages and receive responses from the RAG model.
   - Responses are displayed in a sleek, user-friendly chat interface.

2. **Citations with Tooltips**
   - The RAG model's responses can include citations.
   - Hovering over a citation displays additional information in a tooltip.

3. **Contextual Responses**
   - The RAG model maintains context to provide coherent and relevant responses.
   - Users can reply to specific messages, and the context is preserved for more accurate replies.

4. **Reply to Expand, Summarize, and Collate**
   - Users can reply to a message to expand on a topic, summarize information, or collate data from previous messages.
   - This feature enhances the depth and utility of the conversation.

5. **Configurable Settings**
   - A settings panel allows users to configure the RAG model's behavior.
   - Settings include toggles for rewriting, using fusion, and adjusting search sensitivities.
   - The panel slides in from the right side for easy access.

![llamapp UI](https://raw.githubusercontent.com/rajatasusual/llamapp/main/assets/options.png)


6. **Search Sensitivity Tuning**
   - Users can adjust thresholds for L2 index, cosine index, and fusion to fine-tune the RAG model's search capabilities.
   - These settings help customize the RAG model's performance to better suit user needs.

7. **Persistent Configuration**
   - Configuration settings are stored in `localStorage` and persist across sessions.
   - This ensures that user preferences are maintained without the need for reconfiguration.

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/rajatasusual/llamapp.git
    ```

2. Navigate to the project directory:
    ```sh
    cd llamapp
    ```

3. Install the necessary dependencies:
    ```sh
    npm install
    ```

4. Start the local server:
    ```sh
    npm start
    ```

## Usage

1. Open the application in your browser:
    ```sh
    http://localhost:3000
    ```

2. Interact with the chatRAG model by typing a message in the input box and pressing "Send" or hitting "Enter".

3. To adjust settings, click the settings icon and modify the desired parameters. The panel will slide in from the right.

## Configuration

Default configuration values are stored in `localStorage` and can be modified through the settings panel. Here are the configurable parameters:

- `REWRITE`: Toggle message rewriting (default: true).
- `FUSION`: Toggle fusion usage (default: true).
- `CHAT_TEMPERATURE`: Set the chat temperature (default: 0).
- `L2_INDEX_THRESHOLD`: Adjust the L2 index threshold (default: 250).
- `COSINE_INDEX_THRESHOLD`: Adjust the cosine index threshold (default: 0.25).
- `FUSION_THRESHOLD`: Adjust the fusion threshold (default: 0.1).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.
