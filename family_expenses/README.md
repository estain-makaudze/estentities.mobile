# Family Expenses App 👨‍👩‍👧‍👦

A React Native app built with Expo for tracking shared expenses between family members or roommates, with flexible split configurations and automatic balance calculations.

## Features

### 1. **Per-User Expense Tracking**
- Each expense entry is associated with the user who paid for it
- All users can view all expenses
- Track expenses across different categories (Groceries, Utilities, Rent, etc.)

### 2. **Flexible Split Ratios**
- **No Split**: One person owns the full expense (doesn't affect shared balance)
- **Equal Split**: Expenses are divided equally among all users
- **Custom Split**: Configure any percentage split (e.g., 70/30, 40/40/20)
- Splits can be configured per expense or set as category defaults

### 3. **Category-Based Default Splits** ⭐ NEW
- Configure default split behavior for each expense category
- When adding an expense, the split is automatically populated based on the category's configuration
- Customize defaults in the Settings screen
- Override defaults on individual expenses as needed

### 4. **Automatic Balance Calculation**
- Automatically calculates who owes whom and how much
- Minimizes the number of transactions needed to settle up
- Real-time balance updates as expenses and settlements are added

### 5. **Partial Payments / Settlements**
- Record payments from one user to another
- Payments reduce the outstanding balance accordingly
- Track settlement history

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## App Structure

### Screens
- **Dashboard** (`index.tsx`): Overview of total expenses and who owes whom
- **Expenses** (`expenses.tsx`): List of all recorded expenses
- **Settlements** (`settlements.tsx`): History of payments made
- **Users** (`users.tsx`): Manage users who share expenses
- **Settings** (`settings.tsx`): Configure default splits per category
- **Add Expense** (`add-expense.tsx`): Record a new expense with flexible split options
- **Add Settlement** (`add-settlement.tsx`): Record a payment between users

### Key Files
- `types/index.ts`: TypeScript interfaces for User, Expense, Settlement, CategoryConfig
- `context/AppContext.tsx`: Global state management with React Context
- `utils/storage.ts`: AsyncStorage persistence layer
- `utils/balance.ts`: Balance calculation algorithms

## Usage Examples

### Example 1: Two Roommates Splitting 50/50
- Add two users (e.g., "John" and "Sarah")
- Set all categories to "Equal Split" in Settings
- Add expenses as they occur
- Dashboard shows who owes whom

### Example 2: Custom Split Ratios
- Configure "Rent" category as 70/30 (one person has a larger room)
- Configure "Groceries" as 50/50
- Configure "Utilities" as equal split
- Each category automatically applies its default when adding expenses

### Example 3: Mixed Personal and Shared Expenses
- Set some categories to "No Split" (personal items)
- Set others to equal or custom splits
- Track everything in one place while keeping balances accurate

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
